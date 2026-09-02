import { describe, it, expect, beforeEach } from 'vitest'
import useAnimationStore from './useAnimationStore'

const reset = () =>
  useAnimationStore.setState({ playing: false, progress: 1, hasTarget: false })

describe('useAnimationStore', () => {
  beforeEach(reset)

  it('starts at rest, fully transformed', () => {
    const s = useAnimationStore.getState()
    expect(s.playing).toBe(false)
    expect(s.progress).toBe(1)
  })

  it('play from a finished animation rewinds to 0', () => {
    useAnimationStore.getState().play()
    const s = useAnimationStore.getState()
    expect(s.playing).toBe(true)
    expect(s.progress).toBe(0)
  })

  it('play mid-scrub resumes from the current position', () => {
    useAnimationStore.getState().setProgress(0.4)
    useAnimationStore.getState().play()
    expect(useAnimationStore.getState().progress).toBeCloseTo(0.4)
    expect(useAnimationStore.getState().playing).toBe(true)
  })

  it('stop returns to the resting pose and pauses', () => {
    useAnimationStore.getState().setProgress(0.3)
    useAnimationStore.getState().play()
    useAnimationStore.getState().stop()
    const s = useAnimationStore.getState()
    expect(s.playing).toBe(false)
    expect(s.progress).toBe(1)
  })

  it('setProgress clamps and pauses; tickProgress only clamps', () => {
    useAnimationStore.getState().play()
    useAnimationStore.getState().tickProgress(0.5)
    expect(useAnimationStore.getState().playing).toBe(true)

    useAnimationStore.getState().setProgress(2)
    expect(useAnimationStore.getState().progress).toBe(1)
    useAnimationStore.getState().setProgress(-1)
    expect(useAnimationStore.getState().progress).toBe(0)
    expect(useAnimationStore.getState().playing).toBe(false)
  })

  it('toggle starts playback from 0 when finished, and pauses when playing', () => {
    useAnimationStore.getState().toggle()
    expect(useAnimationStore.getState().playing).toBe(true)
    expect(useAnimationStore.getState().progress).toBe(0)

    useAnimationStore.getState().toggle()
    expect(useAnimationStore.getState().playing).toBe(false)
  })
})
