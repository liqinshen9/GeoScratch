/**
 * The mass-spring declutter solver, split out from LabelDeclutter.jsx so it can
 * be tested without a DOM. The component owns measurement (rect reads) and
 * presentation (transform writes); everything here is pure arithmetic on entry
 * objects.
 *
 * Every constant below, and the reasons most of them cannot move much, are in
 * docs/architecture/label-declutter.md.
 */

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
// Extra velocity decay while a label is in contact. The spring damping alone
// leaves the far stiffer contact regime badly underdamped, which is what made
// crowded labels buzz forever. See docs/architecture/label-declutter.md#contact-damping.
const CONTACT_DAMPING_RATE = 200 // 1/s, at full contact
const CONTACT_RAMP = 2 // px of penetration over which that damping fades in
const MAX_OFFSET = 55 // px hard cap on drift from anchor
const MAX_DT = 0.05 // s single-frame step cap
// Sub-step count is derived from dt, not fixed -- a 60fps-tuned fixed count
// was too coarse when throttled. See docs/architecture/label-declutter.md#substeps.
const TARGET_SUBSTEP_DT = 0.006
// Snaps near-rest velocity to exact 0, else labels creep sub-pixel forever.
// See docs/architecture/label-declutter.md#sleep-velocity.
const SLEEP_VELOCITY = 3

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

/**
 * Advances one frame of the sim. Entries carry their measured screen geometry
 * (`cx`/`cy`, the natural un-offset center, and half-extents `hw`/`hh`) plus the
 * live state the sim owns (`offsetX`/`offsetY`, `velX`/`velY`, `mass`).
 *
 * Returns true while anything is still in motion, so the caller knows to ask
 * for another frame.
 */
function stepLabelSim(entries, delta) {
  const dt = Math.min(delta, MAX_DT)
  // See docs/architecture/label-declutter.md#substeps.
  const substeps = Math.max(1, Math.ceil(dt / TARGET_SUBSTEP_DT))
  const subDt = dt / substeps
  let moving = false

  for (let step = 0; step < substeps; step++) {
    for (const e of entries) {
      // Spring-to-home (home = BASE_OFFSET_*, a fixed screen-space nudge)
      e.fx = -SPRING_K * (e.offsetX - BASE_OFFSET_X)
      e.fy = -SPRING_K * (e.offsetY - BASE_OFFSET_Y)
      e.contact = 0
    }

    // Pairwise repulsion, O(n^2). See docs/architecture/label-declutter.md.
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]
        const b = entries[j]
        let dx = a.cx + a.offsetX - (b.cx + b.offsetX)
        let dy = a.cy + a.offsetY - (b.cy + b.offsetY)
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
        const combinedHW = a.hw + b.hw + GAP
        const combinedHH = a.hh + b.hh + GAP
        const safeDist = minkowskiSafeDist(dirX, dirY, combinedHW, combinedHH) - FORCE_DEADZONE
        const penetration = safeDist - dist
        if (penetration <= 0) continue

        // Linear in penetration, exactly 0 at dist === safeDist.
        // See docs/architecture/label-declutter.md#repulsion-continuity.
        const mag = Math.min(REPEL_K_OVERLAP * penetration, MAX_PAIR_FORCE)

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

        // Blend toward the per-axis direction, don't fully commit.
        // See docs/architecture/label-declutter.md#axis-blend.
        const nx = (1 - AXIS_BLEND) * dirX + AXIS_BLEND * (vx / vlen)
        const ny = (1 - AXIS_BLEND) * dirY + AXIS_BLEND * (vy / vlen)
        const nlen = Math.hypot(nx, ny) || 1

        a.fx += (nx / nlen) * mag
        a.fy += (ny / nlen) * mag
        b.fx -= (nx / nlen) * mag
        b.fy -= (ny / nlen) * mag

        // Ramped from 0 at contact onset, so adding damping cannot reintroduce
        // a discontinuity at the overlap boundary.
        // See docs/architecture/label-declutter.md#contact-damping.
        const gate = Math.min(penetration / CONTACT_RAMP, 1)
        if (gate > a.contact) a.contact = gate
        if (gate > b.contact) b.contact = gate
      }
    }

    // Integrate (semi-implicit Euler) + damping + clamp for this sub-step.
    // Damping is applied as decay rather than as a force so that the much
    // stiffer contact regime can be damped hard without the step-size
    // instability an explicit dashpot would bring.
    for (const e of entries) {
      const decay = Math.exp(-(DAMPING_RATE + CONTACT_DAMPING_RATE * e.contact) * subDt)
      e.velX = (e.velX + (e.fx / e.mass) * subDt) * decay
      e.velY = (e.velY + (e.fy / e.mass) * subDt) * decay
      if (Math.hypot(e.velX, e.velY) < SLEEP_VELOCITY) {
        e.velX = 0
        e.velY = 0
      } else moving = true
      e.offsetX += e.velX * subDt
      e.offsetY += e.velY * subDt

      const mag = Math.hypot(e.offsetX, e.offsetY)
      if (mag > MAX_OFFSET) {
        const s = MAX_OFFSET / mag
        e.offsetX *= s
        e.offsetY *= s
        // Drop only the velocity pushing further out; a label pinned at the cap
        // still slides along it. Scaling both components instead makes the cap
        // bounce labels back inward, which buzzes.
        const ux = e.offsetX / MAX_OFFSET
        const uy = e.offsetY / MAX_OFFSET
        const outward = e.velX * ux + e.velY * uy
        if (outward > 0) {
          e.velX -= outward * ux
          e.velY -= outward * uy
        }
      }
    }
  }

  return moving
}

export {
  stepLabelSim,
  minkowskiSafeDist,
  BASE_OFFSET_X,
  BASE_OFFSET_Y,
  GAP,
  MAX_OFFSET,
  SLEEP_VELOCITY,
}
