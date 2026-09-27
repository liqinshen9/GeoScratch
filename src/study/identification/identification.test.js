import { describe, it, expect } from 'vitest'
import { generateIdentificationScenes, findScene } from './scenes'
import { resolveIdentificationOrder, resolveIdentificationSequence, setForCell } from './sequence'
import { identificationToXml, targetBlockId } from './identificationToXml'
import {
  IDENTIFICATION_CELLS,
  MEASURED_TRIALS_PER_CELL,
  PRACTICE_TRIALS_PER_BLOCK,
  OBJECTS_PER_SCENE,
} from './identificationConfig'

const scenes = generateIdentificationScenes()
const slots = (n) => Array.from({ length: n }, (_, i) => i + 1)

describe('identification scenes', () => {
  it('has one distinct measured set per cell, and practice for each block', () => {
    expect(scenes.measured).toHaveLength(4)
    for (const set of scenes.measured) expect(set).toHaveLength(MEASURED_TRIALS_PER_CELL)
    for (const set of scenes.practice) expect(set).toHaveLength(PRACTICE_TRIALS_PER_BLOCK)
    const ids = [...scenes.measured.flat(), ...scenes.practice.flat()].map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puts one kind of object in a scene, at distinct whole-number positions', () => {
    for (const scene of [...scenes.measured.flat(), ...scenes.practice.flat()]) {
      expect(scene.objects).toHaveLength(OBJECTS_PER_SCENE)
      expect(new Set(scene.objects.map((o) => o.kind))).toEqual(new Set([scene.kind]))
      const positions = scene.objects.map((o) => o.position.join(','))
      expect(new Set(positions).size).toBe(positions.length)
      for (const o of scene.objects)
        for (const v of o.position) expect(Number.isInteger(v)).toBe(true)
      expect(scene.objects.some((o) => o.key === scene.targetKey)).toBe(true)
    }
  })

  it('balances kinds within each measured set', () => {
    for (const set of scenes.measured) {
      const counts = {}
      for (const s of set) counts[s.kind] = (counts[s.kind] ?? 0) + 1
      expect(
        Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)),
      ).toBeLessThanOrEqual(1)
    }
  })

  it('is reproducible from the seed', () => {
    expect(generateIdentificationScenes()).toEqual(scenes)
  })

  it('writes the target block id the scene names', () => {
    const scene = scenes.measured[0][0]
    expect(identificationToXml(scene)).toContain(`id="${targetBlockId(scene)}"`)
    expect(findScene(scenes, scene.id)).toBe(scene)
  })
})

describe('identification order', () => {
  it('gives every slot all four cells', () => {
    for (const slot of slots(20)) {
      expect([...resolveIdentificationOrder(slot).cellOrder].sort()).toEqual(
        IDENTIFICATION_CELLS.map((c) => c.id).sort(),
      )
    }
  })

  it('pairs each scene set with each cell five times over 20 slots', () => {
    const counts = new Map()
    for (const slot of slots(20)) {
      const { setRotation } = resolveIdentificationOrder(slot)
      for (const cell of IDENTIFICATION_CELLS) {
        const key = `${cell.id}:${setForCell(cell.id, setRotation)}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(16)
    for (const count of counts.values()) expect(count).toBe(5)
  })

  it('runs practice first, then every scene of the cell set once', () => {
    const sequence = resolveIdentificationSequence('K7QX3M', 3, scenes)
    expect(sequence.blocks).toHaveLength(4)
    for (const block of sequence.blocks) {
      const practice = block.trials.filter((t) => t.practice)
      const measured = block.trials.filter((t) => !t.practice)
      expect(practice).toHaveLength(PRACTICE_TRIALS_PER_BLOCK)
      expect(block.trials.slice(0, PRACTICE_TRIALS_PER_BLOCK).every((t) => t.practice)).toBe(true)
      expect(new Set(measured.map((t) => t.sceneId))).toEqual(
        new Set(scenes.measured[block.sceneSet].map((s) => s.id)),
      )
    }
    expect(new Set(sequence.blocks.map((b) => b.sceneSet)).size).toBe(4)
  })
})
