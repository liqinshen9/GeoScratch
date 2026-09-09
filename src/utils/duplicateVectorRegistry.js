// Two standalone vector blocks holding the same value draw glyphs that occupy
// exactly the same space: coincident surfaces the depth test can't order, which
// shows as speckling, and only one label survives the overlap. Instead the
// first one drawn owns the glyph and the rest hand it their label.
//
// Reset at the start of every generateAndRun() run, like
// haloIntersectionRegistry.js.

const EPSILON_SQ = 1e-12

let entries = []

export function resetDuplicateVectorRegistry() {
  entries = []
}

/**
 * @returns {string | null} the blockId already drawing this exact vector, or
 * null when this block is the first (and so owns the glyph).
 */
export function registerVectorGlyph(blockId, origin, vector) {
  for (const other of entries) {
    if (
      other.origin.distanceToSquared(origin) < EPSILON_SQ &&
      other.vector.distanceToSquared(vector) < EPSILON_SQ
    ) {
      return other.blockId
    }
  }
  entries.push({ blockId, origin: origin.clone(), vector: vector.clone() })
  return null
}
