import * as Blockly from 'blockly/core'
import { forInstance, forRole } from '@/store/colorSystem'
import { OBJECT_TYPES, COLOR_ROLES } from '@/store/colorPresets'

export const BLOCK_STYLES = Object.freeze({
  CREATE_POINT: 'geoscratch_create_point_blocks',
  CREATE_VECTOR: 'geoscratch_create_vector_blocks',
  CREATE_LINE: 'geoscratch_create_line_blocks',
  CREATE_PLANE: 'geoscratch_create_plane_blocks',
  CREATE_SPHERE: 'geoscratch_create_sphere_blocks',
  CREATE_CUBE: 'geoscratch_create_cube_blocks',
  CREATE_TEAPOT: 'geoscratch_create_teapot_blocks',
  VALUE_PRIMITIVES: 'geoscratch_value_primitive_blocks',
  TRANSFORM_PIPELINE: 'geoscratch_transform_pipeline_blocks',
  TRANSFORM_STEPS: 'geoscratch_transform_steps_blocks',
  COMPUTE_VECTOR_OPERATIONS: 'geoscratch_compute_vector_operations_blocks',
  MATRIX_VALUES: 'geoscratch_matrix_value_blocks',
  OBJECT_VARIABLE: 'geoscratch_object_variable_blocks',
  WORKSPACE_VARIABLE: 'geoscratch_workspace_variable_blocks',
})

// block style -> color-system type key, so the toolbox baseline matches an
// instance's family. See docs/architecture/color-system.md#blockcoloursjs.
export const BLOCK_STYLE_OBJECT_TYPES = Object.freeze({
  [BLOCK_STYLES.CREATE_POINT]: OBJECT_TYPES.POINT,
  [BLOCK_STYLES.CREATE_VECTOR]: OBJECT_TYPES.VECTOR,
  [BLOCK_STYLES.CREATE_LINE]: OBJECT_TYPES.LINE,
  [BLOCK_STYLES.CREATE_PLANE]: OBJECT_TYPES.PLANE,
  [BLOCK_STYLES.CREATE_SPHERE]: OBJECT_TYPES.SPHERE,
  [BLOCK_STYLES.CREATE_CUBE]: OBJECT_TYPES.CUBE,
  [BLOCK_STYLES.CREATE_TEAPOT]: OBJECT_TYPES.TEAPOT,
})

// block.type -> color-system type key, for the live-recolor listener.
// See docs/architecture/color-system.md#blockcoloursjs.
export const BLOCK_TYPE_OBJECT_TYPES = Object.freeze({
  linalg_point: OBJECT_TYPES.POINT,
  geo_show_point_on_object: OBJECT_TYPES.POINT,
  linalg_vec3: OBJECT_TYPES.VECTOR,
  geo_vector: OBJECT_TYPES.LINE, // "Line" block, see geoVectorLine.js
  parametric_plane: OBJECT_TYPES.PLANE,
  geo_plane: OBJECT_TYPES.PLANE,
  geo_sphere: OBJECT_TYPES.SPHERE,
  geo_cube: OBJECT_TYPES.CUBE,
  geo_teapot: OBJECT_TYPES.TEAPOT,
})

// Non-renderable primitives track the preset via the neutral "accent" role.
// See docs/architecture/color-system.md#blockcoloursjs.
export const BLOCK_TYPE_ROLES = Object.freeze({
  scalar: COLOR_ROLES.ACCENT,
  linalg_vec4: COLOR_ROLES.ACCENT,
})

function typeStyle(objectType) {
  // Toolbox baseline (no block id yet); blocks override per-instance in init().
  const colour = forInstance(objectType, null)
  return { colourPrimary: colour, colourSecondary: colour, colourTertiary: colour }
}

function roleStyle(role) {
  const colour = forRole(role)
  return { colourPrimary: colour, colourSecondary: colour, colourTertiary: colour }
}

function flat(colour) {
  return { colourPrimary: colour, colourSecondary: colour, colourTertiary: colour }
}

// The styles that sit deliberately outside the object-color system. Per theme,
// so pipeline/steps/etc. stay legible on the dark workspace.
// See docs/architecture/theming.md.
const FIXED_STYLE_COLOURS = {
  light: {
    [BLOCK_STYLES.TRANSFORM_PIPELINE]: '#ff914d',
    [BLOCK_STYLES.TRANSFORM_STEPS]: '#5dd979',
    [BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]: '#b17ff0',
    [BLOCK_STYLES.MATRIX_VALUES]: '#49a1ff',
    [BLOCK_STYLES.OBJECT_VARIABLE]: '#36cbb4',
    [BLOCK_STYLES.WORKSPACE_VARIABLE]: '#2b2f38',
  },
  dark: {
    [BLOCK_STYLES.TRANSFORM_PIPELINE]: '#e07d3c',
    [BLOCK_STYLES.TRANSFORM_STEPS]: '#3fa85e',
    [BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]: '#8f5fc9',
    [BLOCK_STYLES.MATRIX_VALUES]: '#3a7fd0',
    [BLOCK_STYLES.OBJECT_VARIABLE]: '#2aa593',
    [BLOCK_STYLES.WORKSPACE_VARIABLE]: '#5a6172',
  },
}

// The object-family and role styles read `forInstance` / `forRole` live, so
// they already reflect the active theme (colorSystem picks the preset's `dark`
// block when the store's resolvedTheme is dark).
function buildBlockColourStyles(mode) {
  const fixed = FIXED_STYLE_COLOURS[mode] || FIXED_STYLE_COLOURS.light
  return {
    [BLOCK_STYLES.CREATE_POINT]: typeStyle(OBJECT_TYPES.POINT),
    [BLOCK_STYLES.CREATE_VECTOR]: typeStyle(OBJECT_TYPES.VECTOR),
    [BLOCK_STYLES.CREATE_LINE]: typeStyle(OBJECT_TYPES.LINE),
    [BLOCK_STYLES.CREATE_PLANE]: typeStyle(OBJECT_TYPES.PLANE),
    [BLOCK_STYLES.CREATE_SPHERE]: typeStyle(OBJECT_TYPES.SPHERE),
    [BLOCK_STYLES.CREATE_CUBE]: typeStyle(OBJECT_TYPES.CUBE),
    [BLOCK_STYLES.CREATE_TEAPOT]: typeStyle(OBJECT_TYPES.TEAPOT),
    [BLOCK_STYLES.VALUE_PRIMITIVES]: roleStyle(COLOR_ROLES.ACCENT),
    [BLOCK_STYLES.TRANSFORM_PIPELINE]: flat(fixed[BLOCK_STYLES.TRANSFORM_PIPELINE]),
    [BLOCK_STYLES.TRANSFORM_STEPS]: flat(fixed[BLOCK_STYLES.TRANSFORM_STEPS]),
    [BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]: flat(fixed[BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]),
    [BLOCK_STYLES.MATRIX_VALUES]: flat(fixed[BLOCK_STYLES.MATRIX_VALUES]),
    [BLOCK_STYLES.OBJECT_VARIABLE]: flat(fixed[BLOCK_STYLES.OBJECT_VARIABLE]),
    [BLOCK_STYLES.WORKSPACE_VARIABLE]: flat(fixed[BLOCK_STYLES.WORKSPACE_VARIABLE]),
  }
}

// Backgrounds are deliberately NOT set here -- they come from CSS
// (`.blocklySvg` / `.blocklyFlyoutBackground` bound to --geo-workspace /
// --geo-surface) so they track the app theme live and can't get stuck on a
// stale value when the workspace was injected under a different theme. Only
// the marker colours (which CSS can't reach) are themed here.
const COMPONENT_STYLES = {
  light: {},
  dark: {
    insertionMarkerColour: '#9db0d4',
    insertionMarkerOpacity: 0.4,
    markerColour: '#9db0d4',
  },
}

const themeCache = {}

/** Blockly theme for the resolved app theme ('light' | 'dark'). Memoized. */
export function getBlockTheme(mode = 'light') {
  const key = mode === 'dark' ? 'dark' : 'light'
  if (themeCache[key]) return themeCache[key]
  themeCache[key] = Blockly.Theme.defineTheme(key === 'dark' ? 'geoscratch-dark' : 'geoscratch', {
    base: Blockly.Themes.Classic,
    blockStyles: buildBlockColourStyles(key),
    componentStyles: COMPONENT_STYLES[key],
  })
  return themeCache[key]
}

// Back-compat: the light theme as a plain export.
export const GEO_SCRATCH_BLOCK_THEME = getBlockTheme('light')
export const BLOCK_COLOUR_STYLES = Object.freeze(buildBlockColourStyles('light'))
