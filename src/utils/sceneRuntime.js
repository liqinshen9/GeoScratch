import THREE from '@/utils/three'
import { createInfinitePlaneMesh } from '@/utils/sceneHelpers'
import { createVectorNotationRuntime } from '@/utils/vectorNotation'
import { createRuntimeAccessor } from '@/utils/namingRegistry'
import { HALO_LAYER } from '@/utils/haloLayer'
import { getHaloId } from '@/utils/haloIdRegistry'
import { applyHaloDiscardMaterial } from '@/utils/haloDiscardShader'
import { createHaloIdMaterial } from '@/utils/haloIdMaterial'
import {
  registerHaloLine,
  resetHaloIntersectionRegistry,
  MAX_IMMUNE_IDS,
} from '@/utils/haloIntersectionRegistry'
import { buildVectorShaftGlyph } from '@/utils/vectorShaftGlyph'
import { makeStagedVectorReveal } from '@/utils/stagedVectorReveal'

/**
 * The runtime API available to block builder functions. Builders are
 * .toString()-serialized and have no module scope, so they can't import --
 * add anything new here, not as an import. sceneRuntime.test.js pins this.
 * See docs/architecture/generated-code-runtime.md.
 *
 * @typedef {object} SceneRuntime
 * @property {typeof THREE} THREE                    Composed three.js namespace (see utils/three.js).
 * @property {Record<string, object>} threeObjStore  blockId -> Object3D. What ends up rendered.
 * @property {object} vectorNotation                 Per-run vector labelling helper.
 * @property {object} geoNaming                      Read-only view of the persistent naming registry.
 * @property {Record<string, unknown>} geoVarStore   refId -> value, for variable-wrapper blocks.
 * @property {(key: string, value: unknown) => unknown} geoSetVar
 * @property {(key: string, fallback?: unknown) => unknown} geoVar
 * @property {number} HALO_LAYER
 * @property {Function} getHaloId
 * @property {Function} applyHaloDiscardMaterial
 * @property {Function} createHaloIdMaterial
 * @property {Function} registerHaloLine
 * @property {number} HALO_MAX_IMMUNE_IDS
 * @property {Function} buildVectorShaftGlyph
 * @property {Function} makeStagedVectorReveal
 */

/**
 * Names passed positionally into the generated function, in order. The argument
 * array returned by installSceneRuntime matches this order element for element.
 */
export const RUNTIME_PARAM_NAMES = Object.freeze([
  'THREE',
  'threeObjStore',
  'createInfinitePlaneMesh',
  'vectorNotation',
  'geoNaming',
  'geoSetVar',
  'geoVar',
])

/**
 * Publishes the runtime API onto `window` for this run and returns the
 * positional arguments for the generated function.
 *
 * Call this immediately before evaluating generated code. Most of it is rebuilt
 * per run, matching the "the whole scene is regenerated on every workspace edit"
 * model; the exceptions are called out inline.
 *
 * @param {object} workspace Blockly workspace being run.
 * @param {{ runtimeMode?: string }} [options]
 * @returns {unknown[]} arguments matching {@link RUNTIME_PARAM_NAMES}
 */
export function installSceneRuntime(workspace, options = {}) {
  window.THREE = THREE
  if (!window.threeObjStore) window.threeObjStore = {}
  window.__geoScratchCrossVisualKeys = new Set()
  window.__geoScratchRuntimeMode = options.runtimeMode || 'sandbox'
  window.vectorNotation = createVectorNotationRuntime()

  // NOT recreated per run -- a thin view over names assigned once at
  // block-creation time. See docs/architecture/generated-code-runtime.md.
  window.geoNaming = createRuntimeAccessor(workspace)

  // NOT threeObjStore -- a bare value there would render as a scene object.
  // See docs/architecture/generated-code-runtime.md#varstore-not-threeobjstore.
  window.geoVarStore = {}
  window.geoSetVar = (key, value) => {
    window.geoVarStore[key] = value
    return value
  }
  // Fallback matters -- undefined into an input blanks the whole scene.
  // See docs/architecture/generated-code-runtime.md#geovar-fallback.
  window.geoVar = (key, fallback = null) =>
    Object.prototype.hasOwnProperty.call(window.geoVarStore, key)
      ? window.geoVarStore[key]
      : fallback

  window.HALO_LAYER = HALO_LAYER
  window.getHaloId = getHaloId
  window.applyHaloDiscardMaterial = applyHaloDiscardMaterial
  window.createHaloIdMaterial = createHaloIdMaterial
  window.registerHaloLine = registerHaloLine
  window.HALO_MAX_IMMUNE_IDS = MAX_IMMUNE_IDS
  window.buildVectorShaftGlyph = buildVectorShaftGlyph
  window.makeStagedVectorReveal = makeStagedVectorReveal

  // Fresh per run -- stale entries are harmless but pointless to keep.
  resetHaloIntersectionRegistry()

  return [
    THREE,
    window.threeObjStore,
    createInfinitePlaneMesh,
    window.vectorNotation,
    window.geoNaming,
    window.geoSetVar,
    window.geoVar,
  ]
}
