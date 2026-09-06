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
 * The runtime API available to block builder functions.
 *
 * WHY THIS IS ON `window` AND NOT IMPORTED
 * ----------------------------------------
 * A block's builder function (geoVectorLineDefinition, geoCubeDefinition, ...)
 * is serialised with `.toString()` by its code generator and evaluated inside a
 * `new Function(...)` in generateAndRun.js. The resulting function body has NO
 * module scope: every `import` at the top of the file it was written in is
 * invisible to it at runtime.
 *
 * So a builder must reach everything through the names installed here. Writing
 * `import * as THREE from 'three'` in a block file and using it inside a builder
 * compiles fine, passes lint, and then throws `THREE is not defined` at runtime
 * -- which generateAndRun.js catches, leaving a blank scene and one console
 * error as the only clue.
 *
 * This module is the single list of what a builder may assume exists. If you
 * need something new inside a builder, add it here rather than importing it.
 *
 * A subset (THREE, threeObjStore, createInfinitePlaneMesh, vectorNotation,
 * geoNaming, geoSetVar, geoVar) is ALSO passed as explicit parameters to the
 * generated function -- see RUNTIME_PARAM_NAMES. Top-level generated statements
 * can use those as bare identifiers; a stringified builder body, being a nested
 * function, sees them too. Everything else is `window.`-qualified at the use site.
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

  // Read-only lookup against the persistent naming registry (namingRegistry.js) --
  // unlike vectorNotation, this is NOT recreated fresh per run; it's a thin
  // view over names assigned once at block-creation time, so the same
  // block always reports the same name regardless of run order.
  window.geoNaming = createRuntimeAccessor(workspace)

  // Variable-wrapper store. Deliberately NOT threeObjStore: runAndSync.js
  // renders Object.values(threeObjStore), so a bare Vector3 or number in
  // there would be handed to Scene3D as a scene object. Keyed by the
  // wrapper block's refId, rebuilt every run like the scene itself.
  window.geoVarStore = {}
  window.geoSetVar = (key, value) => {
    window.geoVarStore[key] = value
    return value
  }
  // The fallback matters: a dangling or mis-ordered reference returning
  // undefined into e.g. a vector's "from point:" input throws, and
  // generateAndRun's catch swallows it -- silently blanking the ENTIRE scene. A
  // type-appropriate fallback degrades to one wrong value instead.
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

  // Fresh per run -- a stale entry from a previous run is harmless (its
  // blockId's id is never written by anything once that run's objects are
  // gone), but there's no reason to let the registry grow unbounded across
  // many runs either.
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
