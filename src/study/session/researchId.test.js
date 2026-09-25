import { describe, it, expect } from 'vitest'
import {
  generateResearchId,
  parseStudySlot,
  RESEARCH_ID_ALPHABET,
  RESEARCH_ID_LENGTH,
} from './researchId'

describe('generateResearchId', () => {
  it('draws only from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateResearchId()
      expect(id).toHaveLength(RESEARCH_ID_LENGTH)
      for (const ch of id) expect(RESEARCH_ID_ALPHABET).toContain(ch)
    }
  })

  it('leaves out characters that are easy to misread', () => {
    for (const ch of '0O1IL2Z5S8B') expect(RESEARCH_ID_ALPHABET).not.toContain(ch)
  })

  it('maps random values onto the alphabet', () => {
    const id = generateResearchId((n) => Uint32Array.from({ length: n }, (_, i) => i))
    expect(id).toBe(RESEARCH_ID_ALPHABET.slice(0, RESEARCH_ID_LENGTH))
  })
})

describe('parseStudySlot', () => {
  it('accepts positive integers', () => {
    expect(parseStudySlot('1')).toBe(1)
    expect(parseStudySlot(' 20 ')).toBe(20)
    expect(parseStudySlot(7)).toBe(7)
  })

  it('rejects anything else', () => {
    for (const raw of ['', '0', '-1', '1.5', 'P01', null, undefined, '12345']) {
      expect(parseStudySlot(raw)).toBeNull()
    }
  })
})
