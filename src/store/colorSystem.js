import { Hct, hexFromArgb } from '@material/material-color-utilities'
import { COLOR_PRESETS, DEFAULT_COLOR_PRESET, OBJECT_TYPE_KEYS, COLOR_ROLES } from './colorPresets'

// Deterministic FNV-1a hash: same block id -> same color, nothing persisted.
// See docs/architecture/color-system.md.
function hashString(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function unitFromHash(hash) {
  return hash / 0xffffffff
}

function lerp([min, max], t) {
  return min + (max - min) * t
}

function settingsStore() {
  return typeof window !== 'undefined' ? window.useSettingsStore : null
}

function activePresetName() {
  return settingsStore()?.getState().settings.colorPreset || DEFAULT_COLOR_PRESET
}

// 'light' | 'dark' -- kept on the store by useThemeSync.
function activeMode() {
  return settingsStore()?.getState().resolvedTheme === 'dark' ? 'dark' : 'light'
}

// The preset for the active color-preset name AND theme. A preset's optional
// `dark` block overrides its `types`/`roles` when the theme is dark.
function activePreset() {
  const preset = COLOR_PRESETS[activePresetName()] || COLOR_PRESETS[DEFAULT_COLOR_PRESET]
  if (activeMode() === 'dark' && preset.dark) {
    return { label: preset.label, ...preset.dark }
  }
  return preset
}

function instanceHct(type, blockId) {
  const preset = activePreset()
  const family = preset.types[type]
  if (!family) return null
  const seed = blockId != null ? String(blockId) : `${type}:default`
  const toneHash = hashString(`${seed}:tone`)
  const chromaHash = hashString(`${seed}:chroma`)
  const tone = lerp(family.toneRange, unitFromHash(toneHash))
  const chroma = lerp(family.chromaRange, unitFromHash(chromaHash))
  return { hue: family.hue, chroma, tone }
}

// Color for an object instance, keyed by stable blockId (per-type fallback
// seed when absent). See docs/architecture/color-system.md.
function forInstance(type, blockId) {
  const hct = instanceHct(type, blockId)
  if (!hct) return '#94a3b8'
  return hexFromArgb(Hct.from(hct.hue, hct.chroma, hct.tone).toInt())
}

// A tone-shifted variant of the SAME instance's color (two-band textures, a
// second marker). See docs/architecture/color-system.md.
function forInstanceVariant(type, blockId, toneDelta) {
  const hct = instanceHct(type, blockId)
  if (!hct) return '#94a3b8'
  const tone = Math.max(0, Math.min(100, hct.tone + toneDelta))
  return hexFromArgb(Hct.from(hct.hue, hct.chroma, tone).toInt())
}

// Fixed semantic-role color for teaching illustrations, not per-instance.
function forRole(role) {
  const preset = activePreset()
  return preset.roles[role] || preset.roles[COLOR_ROLES.WARNING]
}

// Subscribe to anything that changes the active palette: the color-preset name
// or the resolved theme (light/dark presets differ). Ignores unrelated setting
// changes. Returns an unsubscribe function.
function subscribeToPreset(callback) {
  const store = settingsStore()
  if (!store) return () => {}
  let prevPreset = store.getState().settings.colorPreset
  let prevTheme = store.getState().resolvedTheme
  return store.subscribe((state) => {
    if (state.settings.colorPreset !== prevPreset || state.resolvedTheme !== prevTheme) {
      prevPreset = state.settings.colorPreset
      prevTheme = state.resolvedTheme
      callback(prevPreset)
    }
  })
}

const GeoScratchColors = {
  forInstance,
  forInstanceVariant,
  forRole,
  subscribeToPreset,
  OBJECT_TYPE_KEYS,
  COLOR_ROLES,
}

if (typeof window !== 'undefined') {
  window.GeoScratchColors = GeoScratchColors
}

export default GeoScratchColors
export { forInstance, forInstanceVariant, forRole, subscribeToPreset }
