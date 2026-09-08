/**
 * A participant code is the join key between the anonymous auth user and the
 * study data. It is typed by a human on the gate screen, so normalise
 * aggressively: trim, collapse inner whitespace, uppercase.
 *
 * @param {unknown} raw
 * @returns {string} the normalised code, or '' if nothing usable was given
 */
export function normalizeParticipantCode(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Whether a normalised code is acceptable to submit. */
export function isValidParticipantCode(raw) {
  const code = normalizeParticipantCode(raw)
  return code.length >= 2 && code.length <= 64
}

/**
 * A cohort tag comes from the `?c=` link parameter, never typed. It separates
 * study runs (and study data from dev data -- a plain URL leaves it blank).
 * Lowercased, restricted to url-safe characters, capped at 64.
 *
 * @param {unknown} raw
 * @returns {string} the normalised cohort, or '' if nothing usable was given
 */
export function normalizeCohort(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 64)
}
