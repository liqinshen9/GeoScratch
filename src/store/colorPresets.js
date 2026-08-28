// Curated color presets for the object-color framework (see colorSystem.js).
//
// Each preset defines, per object TYPE, an HCT family: a fixed `hue` (the
// family identity -- what makes "all spheres" read as one group) plus a
// `chromaRange`/`toneRange` that per-instance colors are drawn from (what
// makes two different spheres look distinct from each other). `chromaRange:
// [0, 0]` pins a type to a neutral gray/black family regardless of hue.
//
// Also defines a small fixed "role" palette for auto-generated teaching
// illustrations (vector arithmetic operands, results, warnings) that does
// NOT vary per instance -- "Operand A" should always mean the same color.

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

export const COLOR_ROLES = Object.freeze({
  OPERAND_A: 'operandA',
  OPERAND_B: 'operandB',
  RESULT: 'result',
  WARNING: 'warning',
  ACCENT: 'accent',
  DISTANCE: 'distance',
})

export const DEFAULT_COLOR_PRESET = 'vivid'

export const COLOR_PRESETS = Object.freeze({
  vivid: {
    label: 'Vivid',
    // Hex values are the color at each family's midpoint chroma/tone (i.e.
    // roughly what a "typical" instance looks like) -- actual instances vary
    // across the full chromaRange/toneRange, so a given block's real color
    // won't match this exactly. Recompute with colorSystem.js's
    // Hct.from(hue, midChroma, midTone) if you change a range and want an
    // updated reference.
    types: {
      [OBJECT_TYPES.POINT]: { hue: 265, chromaRange: [40, 55], toneRange: [35, 60] }, // ~#4570bb
      [OBJECT_TYPES.VECTOR]: { hue: 145, chromaRange: [45, 60], toneRange: [30, 50] }, // ~#1f6d23
      [OBJECT_TYPES.LINE]: { hue: 250, chromaRange: [0, 0], toneRange: [18, 42] }, // ~#474747
      [OBJECT_TYPES.PLANE]: { hue: 205, chromaRange: [35, 50], toneRange: [45, 68] }, // ~#0996a0
      [OBJECT_TYPES.SPHERE]: { hue: 25, chromaRange: [45, 60], toneRange: [45, 68] }, // ~#d5665b
      [OBJECT_TYPES.CUBE]: { hue: 325, chromaRange: [40, 55], toneRange: [45, 68] }, // ~#af70bc
      [OBJECT_TYPES.TEAPOT]: { hue: 235, chromaRange: [35, 50], toneRange: [40, 62] }, // ~#5c76d0
    },
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#1e40af',
      [COLOR_ROLES.OPERAND_B]: '#b91c1c',
      [COLOR_ROLES.RESULT]: '#5b21b6',
      [COLOR_ROLES.WARNING]: '#facc15',
      [COLOR_ROLES.ACCENT]: '#71717a',
      [COLOR_ROLES.DISTANCE]: '#ca8a04',
    },
  },

  monochrome: {
    label: 'Monochrome',
    // See the `vivid` preset above for what these hex comments mean. Capped
    // at tone 58 (none of these should get much lighter than a mid gray) --
    // the scene background and room walls are already very light, so
    // anything lighter than that washed out and was hard to see against them.
    types: {
      [OBJECT_TYPES.POINT]: { hue: 0, chromaRange: [0, 0], toneRange: [40, 48] }, // ~#707070
      [OBJECT_TYPES.VECTOR]: { hue: 0, chromaRange: [0, 0], toneRange: [31, 39] }, // ~#595959
      [OBJECT_TYPES.LINE]: { hue: 0, chromaRange: [0, 0], toneRange: [2, 7] }, // ~#0b0b0b
      [OBJECT_TYPES.PLANE]: { hue: 0, chromaRange: [0, 0], toneRange: [22, 30] }, // ~#424242
      [OBJECT_TYPES.SPHERE]: { hue: 0, chromaRange: [0, 0], toneRange: [14, 21] }, // ~#2d2d2d
      [OBJECT_TYPES.CUBE]: { hue: 0, chromaRange: [0, 0], toneRange: [50, 58] }, // ~#8a8a8a
      [OBJECT_TYPES.TEAPOT]: { hue: 0, chromaRange: [0, 0], toneRange: [8, 13] }, // ~#1b1b1b
    },
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#374151',
      [COLOR_ROLES.OPERAND_B]: '#71717a',
      [COLOR_ROLES.RESULT]: '#111827',
      [COLOR_ROLES.WARNING]: '#6b7280',
      [COLOR_ROLES.ACCENT]: '#4b5563',
      [COLOR_ROLES.DISTANCE]: '#57534e',
    },
  },

  highContrast: {
    label: 'High Contrast',
    // See the `vivid` preset above for what these hex comments mean.
    types: {
      [OBJECT_TYPES.POINT]: { hue: 265, chromaRange: [70, 90], toneRange: [30, 65] }, // ~#006de1
      [OBJECT_TYPES.VECTOR]: { hue: 145, chromaRange: [75, 95], toneRange: [25, 55] }, // ~#006e17
      [OBJECT_TYPES.LINE]: { hue: 250, chromaRange: [0, 0], toneRange: [8, 45] }, // ~#3f3f3f
      [OBJECT_TYPES.PLANE]: { hue: 205, chromaRange: [65, 85], toneRange: [40, 72] }, // ~#00959f
      [OBJECT_TYPES.SPHERE]: { hue: 25, chromaRange: [75, 95], toneRange: [40, 72] }, // ~#f4453c
      [OBJECT_TYPES.CUBE]: { hue: 325, chromaRange: [70, 90], toneRange: [40, 72] }, // ~#ca4fe9
      [OBJECT_TYPES.TEAPOT]: { hue: 235, chromaRange: [60, 80], toneRange: [35, 65] }, // ~#3a5fd9
    },
    roles: {
      [COLOR_ROLES.OPERAND_A]: '#1d4ed8',
      [COLOR_ROLES.OPERAND_B]: '#dc2626',
      [COLOR_ROLES.RESULT]: '#7c3aed',
      [COLOR_ROLES.WARNING]: '#eab308',
      [COLOR_ROLES.ACCENT]: '#52525b',
      [COLOR_ROLES.DISTANCE]: '#b45309',
    },
  },
})
