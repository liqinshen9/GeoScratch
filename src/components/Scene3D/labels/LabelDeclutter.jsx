import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import THREE from '@/utils/three'
import { hexToRgba } from './labelAnchors'

// Labels register here so LabelDeclutter can nudge overlapping ones apart
// each frame. Plain module-level registry, not React context: drei's <Html>
// mounts children into their own separate ReactDOM root, so context from
// above <Html> isn't visible inside it.
const labelRegistry = new Map()
let labelRegistryRevision = 0

// Labels scale gently with camera distance so they still feel "attached" to
// their object when you zoom, but the range is clamped tightly so they never
// shrink to illegible or balloon to distracting sizes.
const LABEL_SCALE_REF_DISTANCE = 56 // ~ default camera distance, so the initial view sits near scale 1
const LABEL_SCALE_MIN = 0.6
const LABEL_SCALE_MAX = 1.0

// Mass-spring label declutter constants. Each label is a point mass with a
// spring pulling it back toward a home position, plus continuous pairwise
// repulsion against other labels. Hand-tuned by feel -- same spirit as the
// LABEL_SCALE_* constants above, not derived exactly.
const SPRING_K = 450 // spring-to-home stiffness -- strong, so a label only drifts from its own anchor
// as much as truly necessary to clear another label, and snaps back close once
// clear (a weak spring let labels settle far from their anchor when two labels'
// homes happened to be close together on screen -- there was nothing pulling the
// pushed-out label back once it escaped the other's overlap zone).
const DAMPING_RATE = 20 // 1/s; velocity decays as exp(-DAMPING_RATE * t), independent of step size --
// scaled up alongside SPRING_K (roughly sqrt(k)) to stay critically damped
// Repulsion is linear in penetration depth and is exactly 0 the instant rects
// stop overlapping -- force must be 0 at the overlap/no-overlap boundary from
// BOTH sides, or the pair oscillates forever across that boundary (a label
// gets kicked out by a discontinuous jump, drifts back in under the spring,
// gets kicked out again, repeat). A separate "soft anticipatory" falloff zone
// for not-yet-overlapping labels was tried and removed for exactly this
// reason -- its force didn't go to 0 at the boundary, so it fought the
// overlap regime and never converged.
//
// The spring never stops pulling a label back toward its home, even once
// repulsion is active, so rest is wherever the two forces balance -- not
// wherever the rects stop overlapping. That equilibrium sits at a nonzero
// residual penetration unless repulsion heavily dominates the spring (a weak
// ratio like the original 900:140 settled with labels still visibly
// touching/overlapping, especially side-by-side where two wide text labels
// need a lot of horizontal separation to fully clear each other). Keeping
// REPEL_K_OVERLAP an order of magnitude above SPRING_K pushes that residual
// penetration down to near-zero without changing the convergence dynamics
// (still continuous/stable, just resolves overlap "harder").
const REPEL_K_OVERLAP = 13000 // repulsion per px of penetration once labels' rects truly overlap.
// Needs to stay well above SPRING_K's ~30:1 ratio (not just scaled by
// the same factor) -- a scene with several labels near each other has
// several pairs pulling on one label at once, diluting how much any one
// pair's repulsion can push against the spring; a same-factor bump left
// 3-4-label clusters with a small residual overlap that this ratio clears.
const MAX_PAIR_FORCE = 15000 // px/s^2 clamp per pair -- bounds single-step impulses (avoids overshoot
// when two labels start out fully coincident, e.g. two labels on one anchor)
const GAP = 8 // px; visual gap once rects stop overlapping
const SIGN_SMOOTH = 3 // px; smoothing width for the per-axis push direction's sign (see its comment)
const AXIS_BLEND = 0.5 // 0..1; how much of the push direction favors the per-axis "cheap axis"
// choice over the plain center-to-center diagonal -- see its comment
// Force is 0 exactly at the overlap/no-overlap boundary (a single point), so
// sub-pixel float/discretization noise right at that point can flip a label
// between "just barely overlapping" and "just barely clear" every sub-step,
// injecting a tiny force each time -- visible as a persistent low-amplitude
// hover that never fully settles. Shifting the zero-force point outward by a
// couple px turns that single point into a small band, so noise within it
// stays force-free and velocity actually decays to a true, unmoving rest.
const FORCE_DEADZONE = 2 // px
const MAX_OFFSET = 55 // px; hard cap on how far a label can ever drift from its anchor
const EMPHASIS_MASS = 2.5 // emphasis labels resist being pushed more, so they "win" contested space
const MAX_DT = 0.05 // seconds; caps a single frame's step (e.g. after a backgrounded tab regains focus)
// Sub-step count is derived from the frame's dt (below), not fixed, so it stays
// robust across very different refresh rates -- a fixed count tuned for 60fps
// (small per-frame dt) was too coarse on a slow/throttled display where each
// frame's dt is much larger, close to MAX_DT, and needs proportionally more
// subdivision for the same stability.
const TARGET_SUBSTEP_DT = 0.006 // seconds; each sub-step aims for roughly this duration
const SLEEP_VELOCITY = 3 // px/s; velocity below this is snapped to 0 so near-equilibrium labels come
// to a true, exact rest instead of perpetually creeping by sub-pixel amounts
// (that creep was invisible in the settle-time numbers but visible on screen
// once labels update every frame instead of every ~50ms).
// Dense or contradictory layouts (for example many labels sharing one exact
// anchor) may have no fully static solution inside MAX_OFFSET. Bound each
// settling burst so an impossible layout cannot keep the tab rendering
// forever. Camera or label-data changes reset this budget.
const MAX_LABEL_SETTLE_FRAMES = 180

// A label's spring rests at a small, fixed *screen-space* offset from its raw
// anchor projection -- never (0,0). A label's world-space authoring offset
// (see LabelLayer's `offset`) can project to ~zero screen displacement from
// some camera angles (the offset vector pointing roughly along the view
// direction), which lets the label render directly on top of -- occluding --
// the object it's labeling. A fixed screen-space offset can't do that: it's
// applied after projection, so it's the same up-and-right nudge regardless of
// camera angle, guaranteeing minimum separation from the marker.
const BASE_OFFSET_DIST = 16 // px
const BASE_OFFSET_ANGLE = (-40 * Math.PI) / 180 // up + right (CSS Y grows downward)
const BASE_OFFSET_X = BASE_OFFSET_DIST * Math.cos(BASE_OFFSET_ANGLE)
const BASE_OFFSET_Y = BASE_OFFSET_DIST * Math.sin(BASE_OFFSET_ANGLE)

// Exact "just touching" center distance for two axis-aligned rects along a
// given direction (nx, ny) -- the Minkowski-sum boundary of the two rects is
// itself a rectangle with these combined half-extents, so the distance to its
// edge along a ray is whichever axis the ray exits first.
function minkowskiSafeDist(nx, ny, combinedHalfWidth, combinedHalfHeight) {
  const tX = Math.abs(nx) > 1e-6 ? combinedHalfWidth / Math.abs(nx) : Infinity
  const tY = Math.abs(ny) > 1e-6 ? combinedHalfHeight / Math.abs(ny) : Infinity
  return Math.min(tX, tY)
}

function LabelAnchor({
  id,
  visibilityKey,
  className,
  color,
  worldPos,
  emphasis,
  onHide,
  children,
}) {
  const bodyRef = useRef(null)

  // Keyed on `id` alone on purpose: this registers/unregisters the label in the
  // simulation, and worldPos/emphasis are only its *initial* values -- the
  // effect below writes later changes onto the live entry in place. Adding them
  // here would drop and re-add the entry on every camera-driven change, losing
  // its settled offset and velocity.
  useEffect(() => {
    const entry = {
      bodyRef,
      worldPos,
      offsetX: 0,
      offsetY: 0,
      velX: 0,
      velY: 0,
      appliedScale: 1,
      mass: emphasis ? EMPHASIS_MASS : 1,
    }
    labelRegistry.set(id, entry)
    labelRegistryRevision += 1
    applyLabelTransform(entry, 0, 0, 1)
    return () => {
      labelRegistry.delete(id)
      labelRegistryRevision += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const entry = labelRegistry.get(id)
    if (!entry) return
    entry.worldPos = worldPos
    entry.mass = emphasis ? EMPHASIS_MASS : 1
    labelRegistryRevision += 1
    // Anchor jumped (scene rebuild) -- kill velocity to avoid a flick, but
    // keep offsetX/offsetY as a warm start since the relative clutter
    // situation is usually similar across rebuilds.
    entry.velX = 0
    entry.velY = 0
  }, [id, worldPos, emphasis])

  const background = color ? hexToRgba(color, 0.55) : undefined

  return (
    <div className="label-anchor">
      <div
        ref={bodyRef}
        className={className}
        style={background ? { backgroundColor: background } : undefined}
        onClick={() => onHide?.(visibilityKey)}
      >
        {children}
      </div>
    </div>
  )
}

function applyLabelTransform(entry, x, y, scale) {
  entry.offsetX = x
  entry.offsetY = y
  entry.appliedScale = scale
  if (entry.bodyRef.current) {
    const parts = []
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)
      parts.push(`translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`)
    if (Math.abs(scale - 1) > 0.01) parts.push(`scale(${scale.toFixed(3)})`)
    // translate3d must come before scale: a CSS transform list applies right-to-left,
    // so this keeps the translation in true screen pixels, independent of scale.
    // Swapping the order would make MAX_OFFSET/GAP/REPEL_* scale-dependent -- don't "clean it up".
    entry.bodyRef.current.style.transform = parts.join(' ')
  }
}

function LabelDeclutter() {
  const scratchVec = useRef(new THREE.Vector3())
  const settleFrameRef = useRef(0)
  const seenRegistryRevisionRef = useRef(-1)
  const cameraStateRef = useRef({
    px: NaN,
    py: NaN,
    pz: NaN,
    qx: NaN,
    qy: NaN,
    qz: NaN,
    qw: NaN,
    zoom: NaN,
  })

  useFrame(({ camera, invalidate }, delta) => {
    // Runs every rendered frame (not throttled to a fixed tick rate) so label
    // motion matches the rest of the scene -- updating position on a coarser
    // cadence than the render loop looked stepped/jittery next to everything
    // else moving at full frame rate. Sub-stepping (below) keeps the physics
    // stable regardless of how big or small this frame's dt is.
    const dt = Math.min(delta, MAX_DT)

    const entries = Array.from(labelRegistry.values()).filter((e) => e.bodyRef.current)

    const previousCamera = cameraStateRef.current
    const cameraChanged =
      previousCamera.px !== camera.position.x ||
      previousCamera.py !== camera.position.y ||
      previousCamera.pz !== camera.position.z ||
      previousCamera.qx !== camera.quaternion.x ||
      previousCamera.qy !== camera.quaternion.y ||
      previousCamera.qz !== camera.quaternion.z ||
      previousCamera.qw !== camera.quaternion.w ||
      previousCamera.zoom !== camera.zoom
    const registryChanged = seenRegistryRevisionRef.current !== labelRegistryRevision

    if (cameraChanged || registryChanged) settleFrameRef.current = 0
    previousCamera.px = camera.position.x
    previousCamera.py = camera.position.y
    previousCamera.pz = camera.position.z
    previousCamera.qx = camera.quaternion.x
    previousCamera.qy = camera.quaternion.y
    previousCamera.qz = camera.quaternion.z
    previousCamera.qw = camera.quaternion.w
    previousCamera.zoom = camera.zoom
    seenRegistryRevisionRef.current = labelRegistryRevision

    // Pass 1: camera-distance scale (unchanged logic, independent of position)
    let labelsStillMoving = false
    entries.forEach((e) => {
      if (!e.worldPos) return
      const dist = scratchVec.current
        .set(e.worldPos[0], e.worldPos[1], e.worldPos[2])
        .distanceTo(camera.position)
      const rawScale = LABEL_SCALE_REF_DISTANCE / Math.max(dist, 1e-3)
      const targetScale = Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, rawScale))
      const scaleDelta = targetScale - e.appliedScale
      if (Math.abs(scaleDelta) < 0.001) {
        e.appliedScale = targetScale
      } else {
        e.appliedScale += scaleDelta * 0.25
        labelsStillMoving = true
      }
    })

    // Pass 2: read (batch all DOM reads before any writes, avoid layout thrash).
    // Geometry (_cx/_cy/_hw/_hh) is only valid for this outer tick -- offsets
    // move within it below, but rect size/natural-center don't change without
    // a fresh DOM read, so they're computed once per tick, not per sub-step.
    entries.forEach((e) => {
      const rect = e.bodyRef.current.getBoundingClientRect()
      e._cx = rect.left + rect.width / 2 - e.offsetX // natural (un-offset) center
      e._cy = rect.top + rect.height / 2 - e.offsetY
      e._hw = rect.width / 2
      e._hh = rect.height / 2
    })

    // Passes 3-5: force + integrate, in several small sub-steps rather than
    // one single frame-sized step. A single step can still be too coarse
    // relative to how stiff the repulsion force can get when several labels
    // overlap at once (summed pairwise forces can move a label further in
    // one step than the separation being resolved) -- that overshoot was
    // itself a second source of the flicker, independent of the force
    // continuity fixed by REPEL_K_OVERLAP-only repulsion above. Sub-stepping
    // is the standard fix for a stiff force / coarse-timestep mismatch.
    const substeps = Math.max(1, Math.ceil(dt / TARGET_SUBSTEP_DT))
    const subDt = dt / substeps
    const velDecay = Math.exp(-DAMPING_RATE * subDt)
    for (let step = 0; step < substeps; step++) {
      entries.forEach((e) => {
        // Spring-to-home force (home = a fixed screen-space nudge, not (0,0) -- see BASE_OFFSET_*)
        e._fx = -SPRING_K * (e.offsetX - BASE_OFFSET_X)
        e._fy = -SPRING_K * (e.offsetY - BASE_OFFSET_Y)
      })

      // Pairwise repulsion, O(n^2) -- fine at label counts of a few dozen.
      // Overlap *detection* (below, via minkowskiSafeDist along the raw
      // center-to-center direction) is unchanged -- it's already continuous
      // and proven flicker-free. Only the *push direction* is reshaped: see
      // the per-axis weighting comment further down.
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i]
          const b = entries[j]
          const ax = a._cx + a.offsetX,
            ay = a._cy + a.offsetY
          const bx = b._cx + b.offsetX,
            by = b._cy + b.offsetY
          let dx = ax - bx
          let dy = ay - by
          let dist = Math.hypot(dx, dy)

          if (dist < 1e-3) {
            // Perfectly coincident (common when multiple labels share one
            // anchor) -- fan out in a deterministic direction per pair instead
            // of an unstable/arbitrary one.
            const angle = i * 2.399963 + j * 0.618034
            dx = Math.cos(angle)
            dy = Math.sin(angle)
            dist = 1
          }

          const dirX = dx / dist
          const dirY = dy / dist
          const combinedHW = a._hw + b._hw + GAP
          const combinedHH = a._hh + b._hh + GAP
          // Zero-force point shifted outward by FORCE_DEADZONE -- see its comment.
          const safeDist = minkowskiSafeDist(dirX, dirY, combinedHW, combinedHH) - FORCE_DEADZONE

          // Rects truly overlap -- linear in penetration depth, 0 exactly at
          // dist === safeDist (see REPEL_K_OVERLAP comment for why that matters).
          let mag = dist < safeDist ? REPEL_K_OVERLAP * (safeDist - dist) : 0

          if (mag > 0) {
            mag = Math.min(mag, MAX_PAIR_FORCE)

            // Per-axis (Manhattan-flavored) push direction: weight each axis
            // inversely to its own overlap depth, so separation happens mostly
            // along whichever axis has LESS overlap -- the "cheap" axis to
            // resolve -- instead of the straight center-to-center diagonal,
            // which wastes some force on an axis that may have plenty of
            // headroom (the common case for two wide, side-by-side text
            // labels: overlap is almost all horizontal, so the push should be
            // too).
            //
            // The per-axis component is the weight times a *smoothed sign* of
            // dx/dy (bounded to roughly +-1), not dx/dy directly: multiplying
            // by the raw values let whichever axis had the numerically larger
            // separation dominate regardless of the weight (e.g. dy~1px but
            // dx~60px still produced an almost-pure-X push even when Y was
            // clearly the cheaper axis to resolve on) -- a real 4-label case
            // settled with a pair still overlapping because of exactly this.
            // The smoothing (SIGN_SMOOTH) keeps it continuous through dx/dy=0
            // instead of a hard sign() flip, same reasoning as FORCE_DEADZONE.
            const overlapX = Math.max(combinedHW - Math.abs(dx), 0.01)
            const overlapY = Math.max(combinedHH - Math.abs(dy), 0.01)
            const wX = overlapY / (overlapX + overlapY)
            const wY = overlapX / (overlapX + overlapY)
            const sx = dx / (Math.abs(dx) + SIGN_SMOOTH)
            const sy = dy / (Math.abs(dy) + SIGN_SMOOTH)
            const vx = wX * sx
            const vy = wY * sy
            const vlen = Math.hypot(vx, vy) || 1
            const axisNx = vx / vlen
            const axisNy = vy / vlen

            // Blend toward the per-axis direction rather than fully committing
            // to it. Fully committing each pair to its own "cheapest axis"
            // works for an isolated pair, but in a scene with several labels
            // (several pairs interacting at once), different pairs can prefer
            // conflicting axes -- a real 4-label case left a pair still
            // overlapping because each pair's individually "efficient" choice
            // fought the others, something the plain diagonal (every pair
            // pushing along the same kind of direction) never ran into.
            // AXIS_BLEND trades some of that per-pair efficiency for the
            // robustness of always having a diagonal component to fall back on.
            const nx = (1 - AXIS_BLEND) * dirX + AXIS_BLEND * axisNx
            const ny = (1 - AXIS_BLEND) * dirY + AXIS_BLEND * axisNy
            const nlen = Math.hypot(nx, ny) || 1

            a._fx += (nx / nlen) * mag
            a._fy += (ny / nlen) * mag
            b._fx -= (nx / nlen) * mag
            b._fy -= (ny / nlen) * mag
          }
        }
      }

      // Integrate (semi-implicit Euler) + damping + clamp for this sub-step
      entries.forEach((e) => {
        e.velX = (e.velX + (e._fx / e.mass) * subDt) * velDecay
        e.velY = (e.velY + (e._fy / e.mass) * subDt) * velDecay
        if (Math.hypot(e.velX, e.velY) < SLEEP_VELOCITY) {
          e.velX = 0
          e.velY = 0
        } else labelsStillMoving = true
        e.offsetX += e.velX * subDt
        e.offsetY += e.velY * subDt

        const mag = Math.hypot(e.offsetX, e.offsetY)
        if (mag > MAX_OFFSET) {
          const s = MAX_OFFSET / mag
          e.offsetX *= s
          e.offsetY *= s
          e.velX *= 0.5
          e.velY *= 0.5 // bleed velocity at the clamp so it doesn't buzz against the wall
        }
      })
    }

    entries.forEach((e) => applyLabelTransform(e, e.offsetX, e.offsetY, e.appliedScale))

    // The canvas renders on demand. Keep ticking only while the label
    // simulation is visibly settling; camera controls and React updates
    // invalidate the canvas themselves when something else changes.
    if (labelsStillMoving && settleFrameRef.current < MAX_LABEL_SETTLE_FRAMES) {
      settleFrameRef.current += 1
      invalidate()
    } else if (!labelsStillMoving) {
      settleFrameRef.current = 0
    }
  })

  return null
}

export { LabelAnchor, LabelDeclutter }
export default LabelDeclutter
