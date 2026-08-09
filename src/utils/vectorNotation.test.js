import { describe, it, expect } from 'vitest'
import { createVectorNotationRuntime } from './vectorNotation'

describe('createVectorNotationRuntime', () => {
  it('assigns stable, numbered point labels per block id, unnumbered on the first', () => {
    const runtime = createVectorNotationRuntime()
    expect(runtime.assignPointLabel('block-a')).toBe('P')
    expect(runtime.assignPointLabel('block-b')).toBe('P2')
    // Re-querying the same block id returns the same label, not a new one.
    expect(runtime.assignPointLabel('block-a')).toBe('P')
  })

  it('numbers the first label when firstHasNumber is set (line/any-point labels)', () => {
    const runtime = createVectorNotationRuntime()
    expect(runtime.assignLineLabel('line-a')).toBe('L1')
    expect(runtime.assignLineLabel('line-b')).toBe('L2')
    expect(runtime.assignAnyPointLabel('pt-a')).toBe('Q1')
  })

  it('keeps separate label sequences per label kind', () => {
    const runtime = createVectorNotationRuntime()
    runtime.assignPointLabel('block-a')
    expect(runtime.assignVectorLabel('vec-a')).toBe('v')
  })

  it('reads labels off userData with a fallback', () => {
    const runtime = createVectorNotationRuntime()
    const labeled = { userData: { label: 'w' } }
    expect(runtime.getLabel(labeled, 'fallback')).toBe('w')
    expect(runtime.getLabel(undefined, 'fallback')).toBe('fallback')
    expect(runtime.hasLabel(labeled)).toBe(true)
    expect(runtime.hasLabel({})).toBe(false)
  })

  it('reports visible-label state independently of label presence', () => {
    const runtime = createVectorNotationRuntime()
    expect(runtime.hasVisibleLabel({ userData: { label: 'w', labelVisible: true } })).toBe(true)
    expect(runtime.hasVisibleLabel({ userData: { label: 'w', labelVisible: false } })).toBe(false)
    expect(runtime.hasVisibleLabel({})).toBe(false)
  })

  it('builds binary and dot-product labels from operand labels/fallbacks', () => {
    const runtime = createVectorNotationRuntime()
    const left = { userData: { label: 'u' } }
    const right = {}
    expect(runtime.binaryLabel(left, '+', right)).toBe('u + b')
    expect(runtime.dotLabel(left, right)).toBe('u dot q')
  })

  it('only shows operand labels when neither operand already has one', () => {
    const runtime = createVectorNotationRuntime()
    const labeled = { userData: { label: 'u' } }
    const unlabeled = {}
    expect(runtime.shouldShowOperandLabels(unlabeled, unlabeled)).toBe(true)
    expect(runtime.shouldShowOperandLabels(labeled, unlabeled)).toBe(false)
  })

  it('formats numbers and vectors to 3 decimal places', () => {
    const runtime = createVectorNotationRuntime()
    expect(runtime.formatNumber(1 / 3)).toBeCloseTo(0.333)
    expect(runtime.formatVector({ x: 1, y: 2 / 3, z: -0.0001 })).toBe('[1, 0.667, 0]')
  })

  it('merges metadata into userData without clobbering existing keys', () => {
    const runtime = createVectorNotationRuntime()
    const vector = { userData: { keep: true } }
    const result = runtime.setVectorMetadata(vector, { label: 'v' })
    expect(result.userData).toEqual({ keep: true, label: 'v' })
    expect(runtime.setVectorMetadata(null, { label: 'x' })).toBe(null)
  })
})
