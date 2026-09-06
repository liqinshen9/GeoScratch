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

// Maps each per-type block style to the object-color-system type key, so the
// toolbox/category baseline color for that style is always the same family
// an actual instance of that type would render with (see colorSystem.js).
export const BLOCK_STYLE_OBJECT_TYPES = Object.freeze({
  [BLOCK_STYLES.CREATE_POINT]: OBJECT_TYPES.POINT,
  [BLOCK_STYLES.CREATE_VECTOR]: OBJECT_TYPES.VECTOR,
  [BLOCK_STYLES.CREATE_LINE]: OBJECT_TYPES.LINE,
  [BLOCK_STYLES.CREATE_PLANE]: OBJECT_TYPES.PLANE,
  [BLOCK_STYLES.CREATE_SPHERE]: OBJECT_TYPES.SPHERE,
  [BLOCK_STYLES.CREATE_CUBE]: OBJECT_TYPES.CUBE,
  [BLOCK_STYLES.CREATE_TEAPOT]: OBJECT_TYPES.TEAPOT,
})

// Maps each of the 7 primary creation blocks' Blockly block *type* (as seen
// on a live block instance, e.g. block.type) to the object-color-system type
// key -- used by useBlocksWorkspace.js to recolor every existing block when
// the color preset changes, since that only has block.type to go on.
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

// Non-renderable value primitives (Scalar, Vector4, ...) have no object
// type/family of their own to render a match against, but should still
// track the active color preset rather than sit at a fixed, unthemed color
// -- the "accent" role is a neutral, already-themed-per-preset color used
// elsewhere for the same "doesn't belong to one of the 7 types" purpose.
// Maps block.type -> role, mirroring BLOCK_TYPE_OBJECT_TYPES's job for the
// useBlocksWorkspace.js live-recolor listener.
export const BLOCK_TYPE_ROLES = Object.freeze({
  scalar: COLOR_ROLES.ACCENT,
  linalg_vec4: COLOR_ROLES.ACCENT,
})

function typeStyle(objectType) {
  // Toolbox/category baseline: the type's family "representative" color
  // (no specific block id yet). Individual blocks override this with their
  // own per-instance color in their init(), see e.g. geoSphere.js.
  const colour = forInstance(objectType, null)
  return { colourPrimary: colour, colourSecondary: colour, colourTertiary: colour }
}

function roleStyle(role) {
  const colour = forRole(role)
  return { colourPrimary: colour, colourSecondary: colour, colourTertiary: colour }
}

export const BLOCK_COLOUR_STYLES = Object.freeze({
  /** Create > Point. */
  [BLOCK_STYLES.CREATE_POINT]: typeStyle(OBJECT_TYPES.POINT),

  /** Create > Vector. */
  [BLOCK_STYLES.CREATE_VECTOR]: typeStyle(OBJECT_TYPES.VECTOR),

  /** Create > Line. */
  [BLOCK_STYLES.CREATE_LINE]: typeStyle(OBJECT_TYPES.LINE),

  /** Create > Plane. */
  [BLOCK_STYLES.CREATE_PLANE]: typeStyle(OBJECT_TYPES.PLANE),

  /** Create > Sphere. */
  [BLOCK_STYLES.CREATE_SPHERE]: typeStyle(OBJECT_TYPES.SPHERE),

  /** Create > Cube. */
  [BLOCK_STYLES.CREATE_CUBE]: typeStyle(OBJECT_TYPES.CUBE),

  /** Create > Teapot. */
  [BLOCK_STYLES.CREATE_TEAPOT]: typeStyle(OBJECT_TYPES.TEAPOT),

  /** Non-renderable value primitives (Scalar, Vector4, ...). */
  [BLOCK_STYLES.VALUE_PRIMITIVES]: roleStyle(COLOR_ROLES.ACCENT),

  /** Transform > Pipeline. */
  [BLOCK_STYLES.TRANSFORM_PIPELINE]: {
    colourPrimary: '#ff914d',
    colourSecondary: '#ff914d',
    colourTertiary: '#ff914d',
  },

  /** Transform > Transforms. */
  [BLOCK_STYLES.TRANSFORM_STEPS]: {
    colourPrimary: '#5dd979',
    colourSecondary: '#5dd979',
    colourTertiary: '#5dd979',
  },

  /** Compute > Vector operations. */
  [BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS]: {
    colourPrimary: '#b17ff0',
    colourSecondary: '#b17ff0',
    colourTertiary: '#b17ff0',
  },

  /** Matrix value blocks that are not currently shown in the main palette. */
  [BLOCK_STYLES.MATRIX_VALUES]: {
    colourPrimary: '#49a1ff',
    colourSecondary: '#49a1ff',
    colourTertiary: '#49a1ff',
  },

  /** 3D object variable getter/setter blocks. */
  [BLOCK_STYLES.OBJECT_VARIABLE]: {
    colourPrimary: '#36cbb4',
    colourSecondary: '#36cbb4',
    colourTertiary: '#36cbb4',
  },

  /**
   * The variable wrapper and its references. Deliberately outside the object
   * colour system: these draw nothing in the 3D scene and carry no geometric
   * type of their own, so they get a neutral near-black rather than a colour
   * that would imply kinship with some object family.
   */
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
