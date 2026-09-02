import { describe, it, expect, beforeEach } from 'vitest'
import useSettingsStore from './useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'
import { OBJECT_HIGHLIGHT_STYLES } from './highlightStyles'

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings()
  })

  it('starts with the documented defaults', () => {
    const { settings } = useSettingsStore.getState()
    expect(settings.lineStyle).toBe(LINE_STYLES.PLAIN_TUBE)
    expect(settings.lineCollisionStyle).toBe(LINE_COLLISION_STYLES.DASHED)
    expect(settings.showLabels).toBe(true)
    expect(settings.haloEnabled).toBe(true)
    expect(settings.vectorStyle).toBe(LINE_STYLES.PLAIN_TUBE)
    expect(settings.extraThickVectors).toBe(false)
    expect(settings.objectHighlightStyle).toBe(OBJECT_HIGHLIGHT_STYLES.BLINK)
  })

  it('updateSetting changes only the targeted key', () => {
    useSettingsStore.getState().updateSetting('showLabels', false)
    const { settings } = useSettingsStore.getState()
    expect(settings.showLabels).toBe(false)
    expect(settings.showGrid).toBe(true) // untouched
  })

  it('resetSettings restores every key to its default after changes', () => {
    useSettingsStore.getState().updateSetting('showLabels', false)
    useSettingsStore.getState().updateSetting('haloEnabled', false)

    useSettingsStore.getState().resetSettings()

    const { settings } = useSettingsStore.getState()
    expect(settings.showLabels).toBe(true)
    expect(settings.haloEnabled).toBe(true)
  })
})
