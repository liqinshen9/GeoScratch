import { describe, it, expect } from 'vitest'
import { normalizeParticipantCode, isValidParticipantCode } from './participantCode'

describe('normalizeParticipantCode', () => {
  it('trims, collapses inner whitespace, and uppercases', () => {
    expect(normalizeParticipantCode('  p 01 ')).toBe('P 01')
    expect(normalizeParticipantCode('abc-12')).toBe('ABC-12')
  })

  it('returns an empty string for non-strings or blanks', () => {
    expect(normalizeParticipantCode(null)).toBe('')
    expect(normalizeParticipantCode(undefined)).toBe('')
    expect(normalizeParticipantCode(42)).toBe('')
    expect(normalizeParticipantCode('   ')).toBe('')
  })
})

describe('isValidParticipantCode', () => {
  it('accepts 2..64 characters after normalisation', () => {
    expect(isValidParticipantCode('p1')).toBe(true)
    expect(isValidParticipantCode('  p1  ')).toBe(true)
    expect(isValidParticipantCode('a'.repeat(64))).toBe(true)
  })

  it('rejects too-short and too-long codes', () => {
    expect(isValidParticipantCode('a')).toBe(false)
    expect(isValidParticipantCode('')).toBe(false)
    expect(isValidParticipantCode('a'.repeat(65))).toBe(false)
  })
})
