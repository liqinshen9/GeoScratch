import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import useSettingsStore from './useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from './lineStyles'
import { OBJECT_HIGHLIGHT_STYLES } from './highlightStyles'
import { THEMES, resolveTheme } from './themeConfig'

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().clearExerciseOverrides()
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

  describe('theme', () => {
    it('defaults to light', () => {
      expect(useSettingsStore.getState().settings.theme).toBe(THEMES.LIGHT)
      expect(THEMES.SYSTEM).toBe('system') // still an available choice in Settings
    })

    it('updateSetting switches the theme', () => {
      useSettingsStore.getState().updateSetting('theme', THEMES.DARK)
      expect(useSettingsStore.getState().settings.theme).toBe(THEMES.DARK)
      useSettingsStore.getState().updateSetting('theme', THEMES.SYSTEM)
      expect(useSettingsStore.getState().settings.theme).toBe(THEMES.SYSTEM)
    })

    it('resetSettings restores the theme along with the other settings', () => {
      useSettingsStore.getState().updateSetting('theme', THEMES.DARK)
      useSettingsStore.getState().updateSetting('showLabels', false)

      useSettingsStore.getState().resetSettings()

      expect(useSettingsStore.getState().settings.showLabels).toBe(true)
      expect(useSettingsStore.getState().settings.theme).toBe(THEMES.LIGHT)
    })

    it('follows the OS only when System is selected', () => {
      expect(resolveTheme(THEMES.SYSTEM, true)).toBe(THEMES.DARK)
      expect(resolveTheme(THEMES.SYSTEM, false)).toBe(THEMES.LIGHT)
      expect(resolveTheme(THEMES.LIGHT, true)).toBe(THEMES.LIGHT)
      expect(resolveTheme(THEMES.DARK, false)).toBe(THEMES.DARK)
      expect(resolveTheme(undefined, true)).toBe(THEMES.LIGHT)
    })

    it('setResolvedTheme updates the derived scheme', () => {
      useSettingsStore.getState().setResolvedTheme('dark')
      expect(useSettingsStore.getState().resolvedTheme).toBe('dark')
    })
  })

  describe('exercise overrides', () => {
    it('wins over both the default and the user setting', () => {
      useSettingsStore.getState().updateSetting('haloEnabled', true)
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false)
      expect(useSettingsStore.getState().isSettingLocked('haloEnabled')).toBe(true)
      expect(useSettingsStore.getState().isSettingLocked('showGrid')).toBe(false)
    })

    it('keeps the user change underneath -- it re-applies when the override clears', () => {
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      useSettingsStore.getState().updateSetting('haloEnabled', false)
      // Override still wins while active
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false)

      useSettingsStore.getState().clearExerciseOverrides()
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false) // the user's value
    })

    it('clearExerciseOverrides reverts unchanged keys to their default', () => {
      useSettingsStore.getState().setExerciseOverrides({ colorPreset: 'monochrome' })
      expect(useSettingsStore.getState().settings.colorPreset).toBe('monochrome')

      useSettingsStore.getState().clearExerciseOverrides()
      expect(useSettingsStore.getState().settings.colorPreset).toBe('vivid')
    })

    it('resetSettings leaves the exercise override in place', () => {
      useSettingsStore.getState().setExerciseOverrides({ haloEnabled: false })
      useSettingsStore.getState().updateSetting('showLabels', false)

      useSettingsStore.getState().resetSettings()

      expect(useSettingsStore.getState().settings.showLabels).toBe(true) // user layer cleared
      expect(useSettingsStore.getState().settings.haloEnabled).toBe(false) // override kept
      expect(useSettingsStore.getState().isSettingLocked('haloEnabled')).toBe(true)
    })

    it('drops unknown keys and undefined values', () => {
      useSettingsStore.getState().setExerciseOverrides({
        haloEnabled: false,
        notARealSetting: 123,
        showGrid: undefined,
      })
      const { exerciseOverrides, settings } = useSettingsStore.getState()
      expect(exerciseOverrides).toEqual({ haloEnabled: false })
      expect(settings.notARealSetting).toBeUndefined()
      expect(settings.showGrid).toBe(true)
    })
  })
})

describe('theme and main settings persistence', () => {
  let storage

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    })
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('restores main settings together with the legacy theme preference', async () => {
    storage.set('geoscratch:user-settings', JSON.stringify({ showGrid: false, haloEnabled: false }))
    storage.set('geoscratch:theme', THEMES.DARK)
    const { default: store } = await import('./useSettingsStore')

    expect(store.getState().settings).toMatchObject({
      showGrid: false,
      haloEnabled: false,
      theme: THEMES.DARK,
    })
    expect(store.getState().resolvedTheme).toBe(THEMES.DARK)

    store.getState().updateSetting('showLabels', false)
    vi.resetModules()
    const { default: reloaded } = await import('./useSettingsStore')
    expect(reloaded.getState().settings).toMatchObject({
      showGrid: false,
      haloEnabled: false,
      showLabels: false,
      theme: THEMES.DARK,
    })
  })

  it('prefers main saved settings over the legacy theme cache', async () => {
    storage.set('geoscratch:user-settings', JSON.stringify({ theme: THEMES.LIGHT }))
    storage.set('geoscratch:theme', THEMES.DARK)
    const { default: store } = await import('./useSettingsStore')
    expect(store.getState().settings.theme).toBe(THEMES.LIGHT)
    expect(store.getState().resolvedTheme).toBe(THEMES.LIGHT)
  })

  it('keeps exercise overrides transient and resets saved preferences', async () => {
    const { default: store } = await import('./useSettingsStore')
    store.getState().updateSetting('theme', THEMES.DARK)
    store.getState().updateSetting('showGrid', false)
    store.getState().setExerciseOverrides({ theme: THEMES.LIGHT, haloEnabled: false })
    expect(JSON.parse(storage.get('geoscratch:user-settings'))).toEqual({
      theme: THEMES.DARK,
      showGrid: false,
    })
    expect(storage.get('geoscratch:theme')).toBe(THEMES.DARK)

    store.getState().resetSettings()
    expect(JSON.parse(storage.get('geoscratch:user-settings'))).toEqual({})
    expect(storage.get('geoscratch:theme')).toBe(THEMES.LIGHT)
    expect(store.getState().settings.haloEnabled).toBe(false)
    store.getState().clearExerciseOverrides()
    expect(store.getState().settings).toMatchObject({
      theme: THEMES.LIGHT,
      showGrid: true,
      haloEnabled: true,
    })
  })
})
