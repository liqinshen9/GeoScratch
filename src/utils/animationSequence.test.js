import { describe, expect, it } from 'vitest'
import { makeAnimationSequence } from './animationSequence'

function part(id, durationScale = 1, calls = []) {
  const animate = (p) => calls.push([id, p])
  animate.durationScale = durationScale
  return { userData: { srcBlockId: id, animate } }
}

describe('makeAnimationSequence', () => {
  it('gives each part a slot sized by its durationScale', () => {
    const calls = []
    const seq = makeAnimationSequence([part('a', 1, calls), part('b', 3, calls)])
    expect(seq.userData.animate.durationScale).toBe(4)
    seq.userData.animate(0.5)
    expect(Object.fromEntries(calls)).toEqual({ a: 1, b: 1 / 3 })
  })

  it('calls the part in progress last', () => {
    const calls = []
    const seq = makeAnimationSequence([part('a', 1, calls), part('b', 1, calls)])
    seq.userData.animate(0.25)
    expect(calls.map(([id]) => id)).toEqual(['b', 'a'])
  })

  it('names the playing part, preferring the step it reports', () => {
    const a = part('a')
    const b = part('b')
    b.userData.animActiveBlockId = 'step-1'
    const seq = makeAnimationSequence([a, b])
    seq.userData.animate(0.25)
    expect(seq.userData.animActiveBlockId).toBe('a')
    seq.userData.animate(0.75)
    expect(seq.userData.animActiveBlockId).toBe('step-1')
    seq.userData.animate(1)
    expect(seq.userData.animActiveBlockId).toBeNull()
  })

  it('rests every part at progress 1', () => {
    const calls = []
    makeAnimationSequence([part('a', 2, calls), part('b', 1, calls)]).userData.animate(1)
    expect(calls).toEqual([
      ['a', 1],
      ['b', 1],
    ])
  })
})
