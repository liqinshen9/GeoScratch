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
 * Which square row a participant gets. A trailing number in the code (P01,
 * P02, ...) maps to rows in order, so handing out numbered codes fills the
 * square evenly; anything else falls back to a hash, which is reproducible but
 * not balanced.
 *
 * @param {string} participantCode
 * @param {number} rows
 */
export function participantRow(participantCode, rows) {
  const match = /(\d+)\s*$/.exec(String(participantCode ?? ''))
  if (match) {
    const number = Number.parseInt(match[1], 10)
    if (number >= 1) return (number - 1) % rows
  }
  return hashSeed(participantCode ?? '') % rows
}
