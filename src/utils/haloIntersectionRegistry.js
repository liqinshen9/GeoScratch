import { linesIntersect } from './lineIntersection'
import { getHaloId } from './haloIdRegistry'

// Max mutual-immunity partners tracked per line -- generous for how many
// OTHER lines could realistically pass through the same point in one
// scene; must match the fixed-size uniform array in haloDiscardShader.js.
export const MAX_IMMUNE_IDS = 4

// Registered once per line per run: { blockId, origin, direction, addImmunePartner }.
// Reset at the start of every generateAndRun() run (see generateAndRun.js)
// so stale entries from a previous run never accumulate -- harmless even if
// left (a dead blockId's id is never written by anything), but unbounded
// growth across many runs isn't worth carrying.
let entries = []

export function resetHaloIntersectionRegistry() {
  entries = []
}

// Compares the new line against every previously-registered line; for any
// pair that genuinely touches in 3D (not just crosses in screen
// projection), marks BOTH lines immune to each other's occlusion id --
// two distinct straight lines that truly intersect can only meet at that
// one point (they're coplanar), so blanket immunity between the pair is
// exact, not an approximation: there's no other location they could
// legitimately need to occlude each other at.
export function registerHaloLine(blockId, origin, direction, addImmunePartner) {
  for (const other of entries) {
    if (linesIntersect(origin, direction, other.origin, other.direction)) {
      // The shader compares immune ids against the numeric halo id decoded
      // from the GPU texture (haloIdRegistry.js), not the raw Blockly block
      // id string -- passing the string here silently coerces to NaN on
      // upload, so the immunity check would never match.
      addImmunePartner(getHaloId(other.blockId))
      other.addImmunePartner(getHaloId(blockId))
    }
  }
  entries.push({ blockId, origin, direction, addImmunePartner })
}
