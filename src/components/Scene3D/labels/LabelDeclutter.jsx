import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import THREE from '@/utils/three'
import { hexToRgba } from './labelAnchors'

// Module-level registry, not React context: drei's <Html> mounts into a
// separate ReactDOM root. See docs/architecture/label-declutter.md.
const labelRegistry = new Map()
let labelRegistryRevision = 0

// Gentle camera-distance scaling, tightly clamped.
const LABEL_SCALE_REF_DISTANCE = 56
const LABEL_SCALE_MIN = 0.6
const LABEL_SCALE_MAX = 1.0

// Mass-spring declutter constants, hand-tuned. Every value below and the
// reasons it can't move much are in docs/architecture/label-declutter.md.
const SPRING_K = 450
const DAMPING_RATE = 20 // scaled ~sqrt(SPRING_K) to stay critically damped
// REPEL_K_OVERLAP must stay >~30:1 over SPRING_K, not same-factor scaled.
// See docs/architecture/label-declutter.md#repel-ratio and #force-balance.
const REPEL_K_OVERLAP = 13000
const MAX_PAIR_FORCE = 15000
const GAP = 8 // px visual gap once rects separate
const SIGN_SMOOTH = 3 // see docs/architecture/label-declutter.md#axis-weighting
const AXIS_BLEND = 0.5 // see docs/architecture/label-declutter.md#axis-blend
// Shifts the zero-force point into a band so boundary noise can't cause a
// persistent hover. See docs/architecture/label-declutter.md#force-deadzone.
const FORCE_DEADZONE = 2 // px
const MAX_OFFSET = 55 // px hard cap on drift from anchor
const EMPHASIS_MASS = 2.5
const MAX_DT = 0.05 // s single-frame step cap
// Sub-step count is derived from dt, not fixed -- a 60fps-tuned fixed count
// was too coarse when throttled. See docs/architecture/label-declutter.md#substeps.
const TARGET_SUBSTEP_DT = 0.006
// Snaps near-rest velocity to exact 0, else labels creep sub-pixel forever.
// See docs/architecture/label-declutter.md#sleep-velocity.
const SLEEP_VELOCITY = 3
// Bounds one settling burst so an impossible layout can't render forever.
const MAX_LABEL_SETTLE_FRAMES = 180

// The spring rests at a fixed SCREEN-SPACE offset, never (0,0) -- a world
// offset can project to ~0 and occlude the marker.
// See docs/architecture/label-declutter.md#base-offset.
const BASE_OFFSET_DIST = 16 // px
const BASE_OFFSET_ANGLE = (-40 * Math.PI) / 180 // up + right (CSS Y grows downward)
const BASE_OFFSET_X = BASE_OFFSET_DIST * Math.cos(BASE_OFFSET_ANGLE)
const BASE_OFFSET_Y = BASE_OFFSET_DIST * Math.sin(BASE_OFFSET_ANGLE)

// Exact "just touching" center distance for two axis-aligned rects along
// (nx, ny). See docs/architecture/label-declutter.md.
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

  // Keyed on `id` alone -- worldPos/emphasis are initial values only, written
  // live by the effect below. See docs/architecture/label-declutter.md#registry-key.
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
    // Anchor jumped (scene rebuild): kill velocity, keep offset as a warm start.
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
    // translate3d MUST come before scale (CSS applies right-to-left).
    // See docs/architecture/label-declutter.md#transform-order.
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

    // Pass 2: batch all DOM reads before any writes.
    // See docs/architecture/label-declutter.md#dom-batching.
    entries.forEach((e) => {
      const rect = e.bodyRef.current.getBoundingClientRect()
      e._cx = rect.left + rect.width / 2 - e.offsetX // natural (un-offset) center
      e._cy = rect.top + rect.height / 2 - e.offsetY
      e._hw = rect.width / 2
      e._hh = rect.height / 2
    })

    // Force + integrate in small sub-steps.
    // See docs/architecture/label-declutter.md#substeps.
    const substeps = Math.max(1, Math.ceil(dt / TARGET_SUBSTEP_DT))
    const subDt = dt / substeps
    const velDecay = Math.exp(-DAMPING_RATE * subDt)
    for (let step = 0; step < substeps; step++) {
      entries.forEach((e) => {
        // Spring-to-home (home = BASE_OFFSET_*, a fixed screen-space nudge)
        e._fx = -SPRING_K * (e.offsetX - BASE_OFFSET_X)
        e._fy = -SPRING_K * (e.offsetY - BASE_OFFSET_Y)
      })

      // Pairwise repulsion, O(n^2). See docs/architecture/label-declutter.md.
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
            // Coincident labels fan out deterministically per pair.
            const angle = i * 2.399963 + j * 0.618034
            dx = Math.cos(angle)
            dy = Math.sin(angle)
            dist = 1
          }

          const dirX = dx / dist
          const dirY = dy / dist
          const combinedHW = a._hw + b._hw + GAP
          const combinedHH = a._hh + b._hh + GAP
          const safeDist = minkowskiSafeDist(dirX, dirY, combinedHW, combinedHH) - FORCE_DEADZONE

          // Linear in penetration, exactly 0 at dist === safeDist.
          // See docs/architecture/label-declutter.md#repulsion-continuity.
          let mag = dist < safeDist ? REPEL_K_OVERLAP * (safeDist - dist) : 0

          if (mag > 0) {
            mag = Math.min(mag, MAX_PAIR_FORCE)

            // Per-axis push weighted inversely to overlap depth, using a
            // smoothed sign of dx/dy (not raw dx/dy).
            // See docs/architecture/label-declutter.md#axis-weighting.
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

            // Blend toward the per-axis direction, don't fully commit.
            // See docs/architecture/label-declutter.md#axis-blend.
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
          e.velY *= 0.5 // bleed velocity at the clamp so it doesn't buzz
        }
      })
    }

    entries.forEach((e) => applyLabelTransform(e, e.offsetX, e.offsetY, e.appliedScale))

    // frameloop="demand": keep ticking only while labels are settling.
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
