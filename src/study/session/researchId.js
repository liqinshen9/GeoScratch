// No 0/O, 1/I/L, 2/Z, 5/S, 8/B: an ID read off the screen and typed into the
// demographic survey must survive being copied by hand.
export const RESEARCH_ID_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'
export const RESEARCH_ID_LENGTH = 6

/**
 * A random research ID. Not derived from anything about the participant, and
 * not seeded: two sessions must never be handed the same ID.
 *
 * @param {(n: number) => Uint32Array} [randomValues]  injectable for tests
 */
export function generateResearchId(randomValues = defaultRandomValues) {
  const values = randomValues(RESEARCH_ID_LENGTH)
  let id = ''
  for (let i = 0; i < RESEARCH_ID_LENGTH; i++) {
    id += RESEARCH_ID_ALPHABET[values[i] % RESEARCH_ID_ALPHABET.length]
  }
  return id
}

function defaultRandomValues(n) {
  return crypto.getRandomValues(new Uint32Array(n))
}

/**
 * The counterbalancing slot the researcher types at the start of a session
 * (1, 2, 3, ...). It picks the Phase 1 Williams row and the holistic order.
 *
 * @returns {number|null} the slot, or null if `raw` is not a positive integer
 */
export function parseStudySlot(raw) {
  const text = String(raw ?? '').trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const slot = Number.parseInt(text, 10)
  return slot >= 1 ? slot : null
}
