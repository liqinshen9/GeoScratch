import { describe, it, expect } from 'vitest'
import { studyDevToolsEnabled, TEST_COHORT } from './devTools'

describe('studyDevToolsEnabled', () => {
  it('is on in a dev build whatever the cohort', () => {
    expect(studyDevToolsEnabled({ dev: true, cohort: 'cohort1' })).toBe(true)
    expect(studyDevToolsEnabled({ dev: true, cohort: null })).toBe(true)
  })

  it('is on for the test cohort in a production build', () => {
    expect(studyDevToolsEnabled({ dev: false, cohort: TEST_COHORT })).toBe(true)
  })

  it('is off for participants in a production build', () => {
    expect(studyDevToolsEnabled({ dev: false, cohort: 'cohort1' })).toBe(false)
    expect(studyDevToolsEnabled({ dev: false, cohort: null })).toBe(false)
  })
})
