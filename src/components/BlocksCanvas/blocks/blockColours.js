import * as Blockly from 'blockly/core'

export const BLOCK_STYLES = Object.freeze({
  CREATE_POINTS_VECTORS: 'geoscratch_create_points_vectors_blocks',
  CREATE_LINES_PLANES: 'geoscratch_create_lines_planes_blocks',
  CREATE_SOLIDS: 'geoscratch_create_solids_blocks',
  TRANSFORM_PIPELINE: 'geoscratch_transform_pipeline_blocks',
  TRANSFORM_STEPS: 'geoscratch_transform_steps_blocks',
  COMPUTE_VECTOR_OPERATIONS: 'geoscratch_compute_vector_operations_blocks',
  MATRIX_VALUES: 'geoscratch_matrix_value_blocks',
  OBJECT_VARIABLE: 'geoscratch_object_variable_blocks',
})

export const BLOCK_COLOUR_STYLES = Object.freeze({
  /** Create > Points & Vectors. */
  [BLOCK_STYLES.CREATE_POINTS_VECTORS]: {
    colourPrimary: '#ff7a95',
    colourSecondary: '#ff7a95',
    colourTertiary: '#ff7a95',
  },

  /** Create > Lines & Planes. */
  [BLOCK_STYLES.CREATE_LINES_PLANES]: {
    colourPrimary: '#22b8cf',
    colourSecondary: '#22b8cf',
    colourTertiary: '#22b8cf',
  },

  /** Create > Solids. */
  [BLOCK_STYLES.CREATE_SOLIDS]: {
    colourPrimary: '#36cbb4',
    colourSecondary: '#36cbb4',
    colourTertiary: '#36cbb4',
  },

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
})

export const GEO_SCRATCH_BLOCK_THEME = Blockly.Theme.defineTheme('geoscratch', {
  base: Blockly.Themes.Classic,
  blockStyles: BLOCK_COLOUR_STYLES,
})
