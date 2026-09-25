import { hashSeed } from './prng'

/**
 * Balanced Latin square (Williams design) for an even number of conditions:
 * every condition appears once in each position, and every ordered pair of
 * adjacent conditions appears exactly once across the rows.
 *
 * @param {number} n  even number of conditions
 * @returns {number[][]} n rows of condition indices
 */
export function williamsSquare(n) {
  if (!Number.isInteger(n) || n < 2 || n % 2 !== 0) {
    throw new Error(`williamsSquare needs an even n >= 2, got ${n}`)
  }
  const first = [0]
  for (let k = 1; first.length < n; k++) {
    first.push(k)
    if (first.length < n) first.push(n - k)
  }
  return Array.from({ length: n }, (_, row) => first.map((c) => (c + row) % n))
}

/**
 * Which square row a participant gets. A study session passes the researcher's
 * counterbalancing slot, which maps to rows in order (slot 1 -> row 0). Without
 * one, a trailing number in the code (P01, P02, ...) does the same; anything
 * else falls back to a hash, which is reproducible but not balanced.
 *
 * @param {string} participantCode
 * @param {number} rows
 * @param {number|null} [slot]  1-based counterbalancing slot
 */
export function participantRow(participantCode, rows, slot = null) {
  if (Number.isInteger(slot) && slot >= 1) return (slot - 1) % rows
  const match = /(\d+)\s*$/.exec(String(participantCode ?? ''))
  if (match) {
    const number = Number.parseInt(match[1], 10)
    if (number >= 1) return (number - 1) % rows
  }
  return hashSeed(participantCode ?? '') % rows
}
