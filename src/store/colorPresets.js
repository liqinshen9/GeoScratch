// Curated HCT color presets. Per-type families (hue + chroma/tone ranges) plus
// a fixed per-role palette. See docs/architecture/color-system.md.

export const OBJECT_TYPES = Object.freeze({
  POINT: 'point',
  VECTOR: 'vector',
  LINE: 'line',
  PLANE: 'plane',
  SPHERE: 'sphere',
  CUBE: 'cube',
  TEAPOT: 'teapot',
})

export const OBJECT_TYPE_KEYS = Object.freeze(Object.values(OBJECT_TYPES))

// Settings > Colors: a fixed colour that replaces a type's whole family (object
// and block). null = automatic, i.e. the preset. See
// docs/architecture/color-system.md#per-type-color-overrides.
export const OBJECT_COLOR_SETTING_KEYS = Object.freeze({
  [OBJECT_TYPES.POINT]: 'pointColor',
  [OBJECT_TYPES.VECTOR]: 'vectorColor',
  [OBJECT_TYPES.LINE]: 'lineColor',
  [OBJECT_TYPES.SPHERE]: 'sphereColor',
  [OBJECT_TYPES.CUBE]: 'cubeColor',
  [OBJECT_TYPES.TEAPOT]: 'teapotColor',
})

export const COLOR_ROLES = Object.freeze({
  OPERAND_A: 'operandA',
  OPERAND_B: 'operandB',
  RESULT: 'result',
  WARNING: 'warning',
  ACCENT: 'accent',
  DISTANCE: 'distance',
})

export const DEFAULT_COLOR_PRESET = 'vivid'

// Vivid and High Contrast type hues: optimizeHues (utils/categoricalPalette.js),
// every type at one shared tone, then assignHues. colorPresets.test.js re-runs
// the optimiser and fails if these drift from it.
// See docs/architecture/color-system.md#how-the-type-hues-are-chosen.
export const PALETTE_TONES = Object.freeze({ light: 50, dark: 56 })

export const VIVID_PALETTE = Object.freeze({
  chroma: 50,
  hues: Object.freeze({
    [OBJECT_TYPES.POINT]: 272,
    [OBJECT_TYPES.VECTOR]: 63,
    [OBJECT_TYPES.PLANE]: 114,
    [OBJECT_TYPES.SPHERE]: 21,
    [OBJECT_TYPES.CUBE]: 333,
    [OBJECT_TYPES.TEAPOT]: 168,
  }),
})

// Assigned against VIVID_PALETTE's hues, so a type keeps its colour family
// across presets.
export const HIGH_CONTRAST_PALETTE = Object.freeze({
  chroma: 85,
  hues: Object.freeze({
    [OBJECT_TYPES.POINT]: 261,
    [OBJECT_TYPES.VECTOR]: 51,
    [OBJECT_TYPES.PLANE]: 105,
    [OBJECT_TYPES.SPHERE]: 9,
    [OBJECT_TYPES.CUBE]: 321,
    [OBJECT_TYPES.TEAPOT]: 156,
  }),
})

const MONOCHROME_PALETTE = Object.freeze({
  chroma: 0,
  hues: Object.fromEntries(Object.keys(VIVID_PALETTE.hues).map((type) => [type, 0])),
})

// Midpoints sit on the palette's chroma and tone; the ranges only matter with
// per-instance variation on. Lines stay neutral.
const TONE_SPREAD = 10
function equalLightnessTypes({ chroma, hues }, tone, chromaSpread) {
  const toneRange = [tone - TONE_SPREAD, tone + TONE_SPREAD]
  return {
    ...Object.fromEntries(
      Object.entries(hues).map(([type, hue]) => [
        type,
        { hue, chromaRange: [chroma - chromaSpread, chroma + chromaSpread], toneRange },
      ]),
    ),
    [OBJECT_TYPES.LINE]: { hue: 0, chromaRange: [0, 0], toneRange },
  }
}

export const COLOR_PRESETS = Object.freeze({
  vivid: {
    label: 'Vivid',
    types: equalLightnessTypes(VIVID_PALETTE, PALETTE_TONES.light, 7),
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#1e40af',
      [COLOR_ROLES.OPERAND_B]: '#b91c1c',
      [COLOR_ROLES.RESULT]: '#5b21b6',
      [COLOR_ROLES.WARNING]: '#facc15',
      [COLOR_ROLES.ACCENT]: '#71717a',
      [COLOR_ROLES.DISTANCE]: '#ca8a04',
    },
    dark: {
      types: equalLightnessTypes(VIVID_PALETTE, PALETTE_TONES.dark, 7),
      roles: {
        [COLOR_ROLES.OPERAND_A]: '#6f9bff',
        [COLOR_ROLES.OPERAND_B]: '#f26d6d',
        [COLOR_ROLES.RESULT]: '#b98cf0',
        [COLOR_ROLES.WARNING]: '#f5d76e',
        [COLOR_ROLES.ACCENT]: '#a1a1aa',
        [COLOR_ROLES.DISTANCE]: '#e0a94a',
      },
    },
  },

  monochrome: {
    label: 'Monochrome',
    // Every type one grey at the palette tone: Vivid minus hue and chroma, with
    // lightness unchanged. See docs/architecture/color-system.md#monochrome.
    types: equalLightnessTypes(MONOCHROME_PALETTE, PALETTE_TONES.light, 0),
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#374151',
      [COLOR_ROLES.OPERAND_B]: '#71717a',
      [COLOR_ROLES.RESULT]: '#111827',
      [COLOR_ROLES.WARNING]: '#6b7280',
      [COLOR_ROLES.ACCENT]: '#4b5563',
      [COLOR_ROLES.DISTANCE]: '#57534e',
    },
    dark: {
      types: equalLightnessTypes(MONOCHROME_PALETTE, PALETTE_TONES.dark, 0),
      roles: {
        [COLOR_ROLES.OPERAND_A]: '#d1d5db',
        [COLOR_ROLES.OPERAND_B]: '#9ca3af',
        [COLOR_ROLES.RESULT]: '#f3f4f6',
        [COLOR_ROLES.WARNING]: '#9ca3af',
        [COLOR_ROLES.ACCENT]: '#b0b6c0',
        [COLOR_ROLES.DISTANCE]: '#c4beb6',
      },
    },
  },

  highContrast: {
    label: 'High Contrast',
    types: equalLightnessTypes(HIGH_CONTRAST_PALETTE, PALETTE_TONES.light, 10),
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#1d4ed8',
      [COLOR_ROLES.OPERAND_B]: '#dc2626',
      [COLOR_ROLES.RESULT]: '#7c3aed',
      [COLOR_ROLES.WARNING]: '#eab308',
      [COLOR_ROLES.ACCENT]: '#52525b',
      [COLOR_ROLES.DISTANCE]: '#b45309',
    },
    dark: {
      types: equalLightnessTypes(HIGH_CONTRAST_PALETTE, PALETTE_TONES.dark, 10),
      roles: {
        [COLOR_ROLES.OPERAND_A]: '#3b82f6',
        [COLOR_ROLES.OPERAND_B]: '#f87171',
        [COLOR_ROLES.RESULT]: '#a78bfa',
        [COLOR_ROLES.WARNING]: '#facc15',
        [COLOR_ROLES.ACCENT]: '#a1a1aa',
        [COLOR_ROLES.DISTANCE]: '#fb923c',
      },
    },
  },
})
