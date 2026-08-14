import { Hct, hexFromArgb } from '@material/material-color-utilities'
import { COLOR_PRESETS, DEFAULT_COLOR_PRESET, OBJECT_TYPE_KEYS, COLOR_ROLES } from './colorPresets'

// Deterministic 32-bit string hash (FNV-1a) so a given block id always maps
// to the same color, across reloads, without persisting anything extra.
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

function activePresetName() {
  const settingsStore = typeof window !== 'undefined' ? window.useSettingsStore : null
  return settingsStore?.getState().settings.colorPreset || DEFAULT_COLOR_PRESET
}

function activePreset() {
  return COLOR_PRESETS[activePresetName()] || COLOR_PRESETS[DEFAULT_COLOR_PRESET]
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

// Color for a specific object instance. `blockId` should be the Blockly
// block's stable id; the same id always produces the same color. When no
// blockId is available (e.g. a toolbox/flyout preview), a per-type stable
// fallback seed is used so the swatch still represents that type's family.
function forInstance(type, blockId) {
  const hct = instanceHct(type, blockId)
  if (!hct) return '#94a3b8'
  return hexFromArgb(Hct.from(hct.hue, hct.chroma, hct.tone).toInt())
}

// A tone-shifted variant of the SAME instance's color (same hue/chroma,
// deterministically the same as forInstance for this type+blockId) -- for
// glyphs that need a second, related shade (e.g. a two-band texture, or a
// second marker on the same object that should still read as "the same
// family" but be visually distinguishable from the first).
function forInstanceVariant(type, blockId, toneDelta) {
  const hct = instanceHct(type, blockId)
  if (!hct) return '#94a3b8'
  const tone = Math.max(0, Math.min(100, hct.tone + toneDelta))
  return hexFromArgb(Hct.from(hct.hue, hct.chroma, tone).toInt())
}

// Fixed semantic-role color (operand A/B, result, warning, accent) used by
// auto-generated teaching illustrations. Not varied per instance.
function forRole(role) {
  const preset = activePreset()
  return preset.roles[role] || preset.roles[COLOR_ROLES.WARNING]
}

// Subscribe to color-preset changes only (ignores unrelated setting changes).
// Returns an unsubscribe function.
function subscribeToPreset(callback) {
  const settingsStore = typeof window !== 'undefined' ? window.useSettingsStore : null
  if (!settingsStore) return () => {}
  let prev = settingsStore.getState().settings.colorPreset
  return settingsStore.subscribe((state) => {
    if (state.settings.colorPreset !== prev) {
      prev = state.settings.colorPreset
      callback(prev)
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
