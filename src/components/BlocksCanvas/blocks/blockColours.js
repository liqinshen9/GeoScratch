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

export const BLOCK_COLOUR_STYLES = Object.freeze({
  [BLOCK_STYLES.CREATE_POINT]: typeStyle(OBJECT_TYPES.POINT),
  [BLOCK_STYLES.CREATE_VECTOR]: typeStyle(OBJECT_TYPES.VECTOR),
  [BLOCK_STYLES.CREATE_LINE]: typeStyle(OBJECT_TYPES.LINE),
  [BLOCK_STYLES.CREATE_PLANE]: typeStyle(OBJECT_TYPES.PLANE),
  [BLOCK_STYLES.CREATE_SPHERE]: typeStyle(OBJECT_TYPES.SPHERE),
  [BLOCK_STYLES.CREATE_CUBE]: typeStyle(OBJECT_TYPES.CUBE),
  [BLOCK_STYLES.CREATE_TEAPOT]: typeStyle(OBJECT_TYPES.TEAPOT),

  [BLOCK_STYLES.VALUE_PRIMITIVES]: roleStyle(COLOR_ROLES.ACCENT),

  [BLOCK_STYLES.TRANSFORM_PIPELINE]: {
    colourPrimary: '#ff914d',
    colourSecondary: '#ff914d',
    colourTertiary: '#ff914d',
  },

  [BLOCK_STYLES.TRANSFORM_STEPS]: {
    colourPrimary: '#5dd979',
    colourSecondary: '#5dd979',
    colourTertiary: '#5dd979',
  },

  [BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]: {
    colourPrimary: '#b17ff0',
    colourSecondary: '#b17ff0',
    colourTertiary: '#b17ff0',
  },

  [BLOCK_STYLES.MATRIX_VALUES]: {
    colourPrimary: '#49a1ff',
    colourSecondary: '#49a1ff',
    colourTertiary: '#49a1ff',
  },

  [BLOCK_STYLES.OBJECT_VARIABLE]: {
    colourPrimary: '#36cbb4',
    colourSecondary: '#36cbb4',
    colourTertiary: '#36cbb4',
  },

  // Deliberately outside the object color system -- draws nothing in 3D, so
  // near-black rather than a color implying an object family.
  [BLOCK_STYLES.WORKSPACE_VARIABLE]: {
    colourPrimary: '#2b2f38',
    colourSecondary: '#2b2f38',
    colourTertiary: '#2b2f38',
  },
})

export const GEO_SCRATCH_BLOCK_THEME = Blockly.Theme.defineTheme('geoscratch', {
  base: Blockly.Themes.Classic,
  blockStyles: BLOCK_COLOUR_STYLES,
})
