/** @typedef {'create' | 'transform' | 'compute' | 'mybox'} BlockCategoryId */

/** Demo objects placed at the bottom of the transform pipeline workspace layout. */
export const PIPELINE_DEMO_OBJECT_TYPES = ['geo_cube', 'geo_sphere']

/** Statement blocks stacked inside {@link transform_pipeline}. */
export const TRANSFORM_STEP_BLOCK_TYPES = ['rot_matrix', 'trans_matrix', 'scale_matrix']

/**
 * @typedef {{ type: string, label?: string }} BlockCatalogEntry
 * @typedef {{ label: string, blocks: BlockCatalogEntry[] }} BlockCatalogGroup
 * @typedef {{
 *   id: BlockCategoryId,
 *   label: string,
 *   subtitle: string,
 *   description: string,
 *   accent: 'blue' | 'green' | 'purple' | 'pink',
 *   groups: BlockCatalogGroup[],
 * }} BlockCategory
 */

/** @type {Record<BlockCategoryId, BlockCategory>} */
export const BLOCK_CATEGORIES = {
  create: {
    id: 'create',
    label: 'Create',
    subtitle: 'Build geometric objects and vectors.',
    description: 'Points, vectors, shapes',
    accent: 'blue',
    groups: [
      {
        label: 'Points & Vectors',
        blocks: [
          { type: 'geo_show_point_on_object', label: 'Show any point on object' },
          { type: 'geo_vector', label: 'Vector line' },
          { type: 'linalg_point', label: 'Point (x, y, z)' },
          { type: 'linalg_vec3', label: 'Vector (x, y, z)' },
          { type: 'scalar', label: 'Scalar' },
        ],
      },
      {
        label: 'Lines & Planes',
        blocks: [{ type: 'parametric_plane', label: 'Parametric plane' }],
      },
      {
        label: 'Solids',
        blocks: [
          { type: 'geo_cube', label: 'Cube' },
          { type: 'geo_sphere', label: 'Sphere' },
          { type: 'geo_teapot', label: 'Teapot' },
        ],
      },
    ],
  },
  transform: {
    id: 'transform',
    label: 'Transform',
    subtitle: 'Move, rotate, and scale objects.',
    description: 'Move, rotate, scale',
    accent: 'green',
    groups: [
      {
        label: 'Pipeline',
        blocks: [{ type: 'transform_pipeline', label: 'Transform pipeline' }],
      },
      {
        label: 'Transforms',
        blocks: [
          { type: 'rot_matrix', label: 'Rotation matrix' },
          { type: 'trans_matrix', label: 'Translation matrix' },
          { type: 'scale_matrix', label: 'Scale matrix' },
        ],
      },
    ],
  },
  compute: {
    id: 'compute',
    label: 'Compute',
    subtitle: 'Vector operations and measurements.',
    description: 'Vector operations',
    accent: 'purple',
    groups: [
      {
        label: 'Vector operations',
        blocks: [
          { type: 'vector_arithmetic', label: 'Vector arithmetic' },
          { type: 'vector_cross_product', label: 'Cross product' },
          { type: 'vector_dot_product', label: 'Dot product' },
          { type: 'vector_normalise', label: 'Normalise' },
          { type: 'vector_project', label: 'Project' },
          { type: 'vector_magnitude', label: 'Magnitude' },
        ],
      },
    ],
  },
  mybox: {
    id: 'mybox',
    label: 'My Blocks',
    subtitle: 'Save and reuse your own composite blocks.',
    description: 'Custom blocks',
    accent: 'pink',
    groups: [],
  },
}

/** @param {BlockCategoryId} id */
export function getCategory(id) {
  return BLOCK_CATEGORIES[id]
}

/** @param {BlockCategory} category */
export function flattenCategoryBlocks(category) {
  return category.groups.flatMap((g) => g.blocks)
}
