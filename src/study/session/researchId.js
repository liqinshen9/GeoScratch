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

// Reserved for trying the study out (TEST1, TEST2, ...). The S keeps them out of
// the generated alphabet, so a test session can never share a real ID.
const TEST_RESEARCH_ID = /^TEST\d{1,3}$/

export const isTestResearchId = (id) => TEST_RESEARCH_ID.test(String(id ?? ''))

/**
 * A research ID from a study link (see scripts/studyLinks.mjs), or a test ID.
 *
 * @returns {string|null} the ID, or null if `raw` could not have been generated
 */
export function parseResearchId(raw) {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (isTestResearchId(text)) return text
  if (text.length !== RESEARCH_ID_LENGTH) return null
  return [...text].every((ch) => RESEARCH_ID_ALPHABET.includes(ch)) ? text : null
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
