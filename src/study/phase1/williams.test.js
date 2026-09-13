import { describe, it, expect } from 'vitest'
import { williamsSquare, participantRow } from './williams'

describe('williamsSquare', () => {
  it('puts every condition in every position exactly once', () => {
    const square = williamsSquare(10)
    expect(square).toHaveLength(10)
    for (const row of square) expect(new Set(row).size).toBe(10)
    for (let col = 0; col < 10; col++) {
      expect(new Set(square.map((row) => row[col])).size).toBe(10)
    }
  })

  it('has every ordered adjacent pair exactly once (first-order carryover balance)', () => {
    const square = williamsSquare(10)
    const pairs = new Map()
    for (const row of square) {
      for (let i = 0; i < row.length - 1; i++) {
        const key = `${row[i]}>${row[i + 1]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
    expect(pairs.size).toBe(10 * 9)
    expect([...pairs.values()].every((count) => count === 1)).toBe(true)
  })

  it('rejects an odd size', () => {
    expect(() => williamsSquare(9)).toThrow()
  })
})

describe('participantRow', () => {
  it('maps numbered codes onto rows in order, wrapping', () => {
    expect(participantRow('P01', 10)).toBe(0)
    expect(participantRow('P10', 10)).toBe(9)
    expect(participantRow('P11', 10)).toBe(0)
    expect(participantRow('P20', 10)).toBe(9)
  })

  it('numbered codes 1..20 fill each row exactly twice', () => {
    const counts = Array(10).fill(0)
    for (let n = 1; n <= 20; n++) counts[participantRow(`P${n}`, 10)]++
    expect(counts.every((c) => c === 2)).toBe(true)
  })

  it('falls back to a stable hash without a trailing number', () => {
    const row = participantRow('ALPHA', 10)
    expect(row).toBeGreaterThanOrEqual(0)
    expect(row).toBeLessThan(10)
    expect(participantRow('ALPHA', 10)).toBe(row)
  })
})
