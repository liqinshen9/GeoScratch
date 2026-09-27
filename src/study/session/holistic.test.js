import { describe, it, expect } from 'vitest'
import {
  resolveHolisticOrder,
  configurationSettings,
  COMBINATIONS,
  HOLISTIC_TASKS,
  CONFIGURATIONS,
} from './holistic'
import { getTechnique, CUE_SETTING_KEYS } from '@/study/phase1/conditions'

const slots = (n) => Array.from({ length: n }, (_, i) => i + 1)

describe('resolveHolisticOrder', () => {
  it('gives every slot all four combinations, blocked on mode', () => {
    for (const slot of slots(20)) {
      const { conditions } = resolveHolisticOrder(slot)
      expect(conditions.map((c) => c.number).sort()).toEqual([1, 2, 3, 4])
      expect(conditions[0].mode).toBe(conditions[1].mode)
      expect(conditions[2].mode).toBe(conditions[3].mode)
      expect(conditions[0].mode).not.toBe(conditions[2].mode)
    }
  })

  it('gives every slot all four tasks, one per combination', () => {
    for (const slot of slots(20)) {
      const tasks = resolveHolisticOrder(slot).conditions.map((c) => c.exerciseId)
      expect([...tasks].sort()).toEqual([...HOLISTIC_TASKS].sort())
    }
  })

  it('puts each task in each combination equally often over 20 slots', () => {
    const counts = new Map()
    for (const slot of slots(20)) {
      for (const c of resolveHolisticOrder(slot).conditions) {
        const key = `${c.number}:${c.exerciseId}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(16)
    for (const count of counts.values()) expect(count).toBe(5)
  })

  it('crosses order group with task row over slots 1-16', () => {
    const pairs = new Set(
      slots(16).map((slot) => {
        const { group, taskRow } = resolveHolisticOrder(slot)
        return `${group}:${taskRow}`
      }),
    )
    expect(pairs.size).toBe(16)
  })

  it('balances which mode and which configuration come first', () => {
    const firsts = slots(20).map((slot) => resolveHolisticOrder(slot).conditions[0])
    expect(firsts.filter((c) => c.mode === 'static')).toHaveLength(10)
    expect(firsts.filter((c) => c.configuration === CONFIGURATIONS.BASELINE)).toHaveLength(10)
  })
})

describe('configurationSettings', () => {
  it('matches T1 and T10 on every cue key', () => {
    const baseline = configurationSettings(CONFIGURATIONS.BASELINE)
    const perception = configurationSettings(CONFIGURATIONS.PERCEPTION)
    for (const key of CUE_SETTING_KEYS) {
      expect(baseline[key]).toBe(getTechnique('T1').settings[key])
      expect(perception[key]).toBe(getTechnique('T10').settings[key])
    }
  })

  it('turns per-instance colour variation off in both configurations', () => {
    expect(configurationSettings(CONFIGURATIONS.BASELINE).colorInstanceVariation).toBe(false)
    expect(configurationSettings(CONFIGURATIONS.PERCEPTION).colorInstanceVariation).toBe(false)
  })

  it('forces the light theme in both configurations', () => {
    expect(configurationSettings(CONFIGURATIONS.BASELINE).theme).toBe('light')
    expect(configurationSettings(CONFIGURATIONS.PERCEPTION).theme).toBe('light')
  })

  it('raises label detail only in the perception-driven configuration', () => {
    expect(configurationSettings(CONFIGURATIONS.BASELINE).labelDetail).toBe('nameOnly')
    expect(configurationSettings(CONFIGURATIONS.PERCEPTION).labelDetail).toBe('nameAndValue')
  })

  it('numbers combinations 1-4 in a fixed order', () => {
    expect(COMBINATIONS.map((c) => c.number)).toEqual([1, 2, 3, 4])
  })
})
