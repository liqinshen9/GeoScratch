import { linesIntersect } from './lineIntersection'
import { getHaloId } from './haloIdRegistry'

// Must match the fixed-size uniform array in haloDiscardShader.js.
export const MAX_IMMUNE_IDS = 4

let entries = []

export function resetHaloIntersectionRegistry() {
  entries = []
}

// Marks genuinely-touching line pairs mutually immune to each other's halo
// occlusion. Exact, not a tolerance: two distinct straight lines can only
// meet at one point. See docs/architecture/halos.md.
export function registerHaloLine(blockId, origin, direction, addImmunePartner) {
  for (const other of entries) {
    if (linesIntersect(origin, direction, other.origin, other.direction)) {
      // Must convert to numeric halo id: the raw blockId string coerces to
      // NaN on GPU upload. See docs/architecture/halos.md#immune-id-type.
      addImmunePartner(getHaloId(other.blockId))
      other.addImmunePartner(getHaloId(blockId))
    }
  }
  entries.push({ blockId, origin, direction, addImmunePartner })
}
