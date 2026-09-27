import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forInstance } from './colorSystem'

function stubSettings(settings) {
  globalThis.window = {
    useSettingsStore: {
      getState: () => ({ settings: { colorPreset: 'vivid', ...settings }, resolvedTheme: 'light' }),
    },
  }
}

describe('forInstance', () => {
  beforeEach(() => stubSettings({}))
  afterEach(() => {
    delete globalThis.window
  })

  it('gives every instance of a type the same colour when variation is off', () => {
    stubSettings({ colorInstanceVariation: false })
    expect(forInstance('sphere', 'block-a')).toBe(forInstance('sphere', 'block-b'))
  })

  it('varies instances of a type when variation is on', () => {
    stubSettings({ colorInstanceVariation: true })
    expect(forInstance('sphere', 'block-a')).not.toBe(forInstance('sphere', 'block-b'))
  })
})
