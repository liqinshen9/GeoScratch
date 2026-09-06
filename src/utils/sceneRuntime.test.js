import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installSceneRuntime, RUNTIME_PARAM_NAMES } from './sceneRuntime'

// A block builder is stringified into generated code and evaluated with no
// module scope, so the ONLY things it can reach are the names installSceneRuntime
// publishes. These tests pin that surface: dropping a name here is a silent
// runtime failure in every builder that used it, not a compile error.

// Minimal stand-in for a Blockly workspace -- createRuntimeAccessor only walks
// blocks to build a name lookup, so an empty workspace is enough.
const fakeWorkspace = {
  getAllBlocks: () => [],
  getBlocksByType: () => [],
  getBlockById: () => null,
}

describe('installSceneRuntime', () => {
  beforeEach(() => {
    globalThis.window = {}
  })

  afterEach(() => {
    delete globalThis.window
  })

  it('publishes every name a stringified block builder can rely on', () => {
    installSceneRuntime(fakeWorkspace)

    // Kept as an explicit literal rather than derived from the implementation:
    // the point is to fail when the published surface changes, so that removing
    // a name is a deliberate edit here and not an invisible regression.
    expect(Object.keys(window).sort()).toEqual(
      [
        'THREE',
        '__geoScratchCrossVisualKeys',
        '__geoScratchRuntimeMode',
        'applyHaloDiscardMaterial',
        'buildVectorShaftGlyph',
        'createHaloIdMaterial',
        'geoNaming',
        'geoSetVar',
        'geoVar',
        'geoVarStore',
        'getHaloId',
        'HALO_LAYER',
        'HALO_MAX_IMMUNE_IDS',
        'makeStagedVectorReveal',
        'registerHaloLine',
        'threeObjStore',
        'vectorNotation',
      ].sort(),
    )
  })

  it('returns arguments positionally matching RUNTIME_PARAM_NAMES', () => {
    const args = installSceneRuntime(fakeWorkspace)

    // new Function(...RUNTIME_PARAM_NAMES, code) is called with these args, so a
    // mismatch in length or order silently binds the wrong value to each name.
    expect(args).toHaveLength(RUNTIME_PARAM_NAMES.length)
    expect(args[RUNTIME_PARAM_NAMES.indexOf('THREE')]).toBe(window.THREE)
    expect(args[RUNTIME_PARAM_NAMES.indexOf('threeObjStore')]).toBe(window.threeObjStore)
    expect(args[RUNTIME_PARAM_NAMES.indexOf('geoVar')]).toBe(window.geoVar)
    expect(typeof args[RUNTIME_PARAM_NAMES.indexOf('createInfinitePlaneMesh')]).toBe('function')
  })

  it('exposes THREE with the addon classes folded in', () => {
    installSceneRuntime(fakeWorkspace)

    // Builders construct these by name off the single THREE object; if the
    // composition in utils/three.js regresses to a bare `import * as three`,
    // every line and teapot glyph breaks at runtime with no build error.
    expect(window.THREE.Vector3).toBeTypeOf('function')
    expect(window.THREE.TeapotGeometry).toBeTypeOf('function')
    expect(window.THREE.Line2).toBeTypeOf('function')
    expect(window.THREE.LineMaterial).toBeTypeOf('function')
  })

  it('preserves an existing threeObjStore but rebuilds the variable store', () => {
    // runAndSync.js clears threeObjStore itself before each run; the runtime must
    // not stomp it, or objects registered earlier in the same run disappear.
    window.threeObjStore = { existing: 'kept' }
    window.geoVarStore = { stale: 'dropped' }

    installSceneRuntime(fakeWorkspace)

    expect(window.threeObjStore).toEqual({ existing: 'kept' })
    expect(window.geoVarStore).toEqual({})
  })

  it('defaults runtimeMode to sandbox and honours an override', () => {
    installSceneRuntime(fakeWorkspace)
    expect(window.__geoScratchRuntimeMode).toBe('sandbox')

    installSceneRuntime(fakeWorkspace, { runtimeMode: 'exercise-6' })
    expect(window.__geoScratchRuntimeMode).toBe('exercise-6')
  })
})

describe('geoVar / geoSetVar', () => {
  beforeEach(() => {
    globalThis.window = {}
    installSceneRuntime(fakeWorkspace)
  })

  afterEach(() => {
    delete globalThis.window
  })

  it('round-trips a value and returns it from the setter', () => {
    expect(window.geoSetVar('a', 42)).toBe(42)
    expect(window.geoVar('a')).toBe(42)
  })

  it('returns the fallback for an unknown key rather than undefined', () => {
    // A dangling reference returning undefined into e.g. a vector input throws,
    // and generateAndRun's catch swallows it -- blanking the whole scene. The
    // fallback degrades to one wrong value instead.
    expect(window.geoVar('missing')).toBeNull()
    expect(window.geoVar('missing', 7)).toBe(7)
  })

  it('does not treat inherited Object properties as stored values', () => {
    expect(window.geoVar('toString', 'fallback')).toBe('fallback')
  })

  it('stores a falsy value rather than falling through to the fallback', () => {
    window.geoSetVar('zero', 0)
    expect(window.geoVar('zero', 99)).toBe(0)
  })
})
