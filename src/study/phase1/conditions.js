import { DEFAULT_SETTINGS } from '@/store/useSettingsStore'
import { LINE_STYLES, LINE_COLLISION_STYLES } from '@/store/lineStyles'
import { THEMES } from '@/store/themeConfig'

// Phase 1 rendering conditions (dissertation Method, Table tab:conditions).
// Every condition is a complete settings object: it pins every key, so nothing
// a participant set on this device can leak into a trial. Non-cue keys keep the
// app defaults, so the scene looks like the normal 3D view.
// See docs/architecture/study-phase1.md#conditions.

const NO_CUES = {
  lineStyle: LINE_STYLES.PLAIN_LINE,
  vectorStyle: LINE_STYLES.PLAIN_LINE,
  colorPreset: 'vivid',
  lineCollisionStyle: LINE_COLLISION_STYLES.NONE,
  haloEnabled: false,
  haloLineVectorEnabled: false,
  objectsReceiveShadows: false,
  primitivesCastShadows: false,
  pointShadowsEnabled: false,
  cameraShadowsEnabled: false,
}

const T1 = {
  ...DEFAULT_SETTINGS,
  theme: THEMES.LIGHT,
  autoFocusOnNewObject: false,
  ...NO_CUES,
}

const TUBES = { lineStyle: LINE_STYLES.PLAIN_TUBE, vectorStyle: LINE_STYLES.PLAIN_TUBE }
const ACCENTS = { lineCollisionStyle: LINE_COLLISION_STYLES.DASHED }
const HALOS = { haloEnabled: true, haloLineVectorEnabled: true }
const OVERHEAD_SHADOW = {
  pointShadowsEnabled: true,
  objectsReceiveShadows: true,
  primitivesCastShadows: true,
}
const CAMERA_SHADOW = { cameraShadowsEnabled: true }

const T2 = { ...T1, ...TUBES }
const T6 = { ...T2, ...OVERHEAD_SHADOW }

export const TECHNIQUES = Object.freeze([
  { id: 'T1', label: 'Unshaded line primitives', base: null, settings: T1 },
  { id: 'T2', label: 'Tube geometry', base: 'T1', settings: T2 },
  {
    id: 'T3',
    label: 'Ringed tube geometry',
    base: 'T1',
    settings: { ...T1, lineStyle: LINE_STYLES.RINGED_TUBE, vectorStyle: LINE_STYLES.RINGED_TUBE },
  },
  { id: 'T4', label: 'Collision accents', base: 'T1', settings: { ...T1, ...ACCENTS } },
  { id: 'T5', label: 'Depth-dependent halos', base: 'T1', settings: { ...T1, ...HALOS } },
  { id: 'T6', label: 'Overhead shadow', base: 'T2', settings: T6 },
  {
    id: 'T7',
    label: 'Overhead + camera shadow',
    base: 'T6',
    settings: { ...T6, ...CAMERA_SHADOW },
  },
  {
    id: 'T8',
    label: 'Monochrome palette',
    base: 'T1',
    settings: { ...T1, colorPreset: 'monochrome' },
  },
  {
    id: 'T9',
    label: 'High-contrast palette',
    base: 'T1',
    settings: { ...T1, colorPreset: 'highContrast' },
  },
  {
    id: 'T10',
    label: 'Combined',
    base: 'T2',
    settings: { ...T2, ...ACCENTS, ...HALOS, ...OVERHEAD_SHADOW, ...CAMERA_SHADOW },
  },
])

export const TECHNIQUE_IDS = Object.freeze(TECHNIQUES.map((t) => t.id))

export function getTechnique(id) {
  return TECHNIQUES.find((t) => t.id === id) ?? null
}
