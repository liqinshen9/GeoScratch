// @vitest-environment jsdom
//
// Generated-code coverage for the staged reveal: these blocks' builders are
// spliced into a string and run through `new Function`, so nothing else in the
// suite ever executes them. See docs/architecture/generated-code-runtime.md.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// The real colorSystem pulls in @material/material-color-utilities, whose ESM
// subpath doesn't resolve under vitest. Builders read window.GeoScratchColors.
vi.mock('@/store/colorSystem', () => ({
  forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc',
  forRole: () => '#ff8800',
  subscribeToPreset: () => () => {},
}))

import * as Blockly from 'blockly/core'
import { javascriptGenerator } from 'blockly/javascript'
import defineBlocks from '@/components/BlocksCanvas/blocks'
import { installSceneRuntime, RUNTIME_PARAM_NAMES } from '@/utils/sceneRuntime'

beforeAll(() => {
  window.GeoScratchColors = {
    forInstance: () => '#3366cc',
    forInstanceVariant: () => '#3366cc',
    forRole: () => '#ff8800',
  }
  // jsdom has no 2D canvas context; the glyph's ring texture only needs these.
  const noop = () => {}
  const fakeCtx = new Proxy(
    { fillStyle: '', canvas: null },
    { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) },
  )
  HTMLCanvasElement.prototype.getContext = () => fakeCtx
  defineBlocks()
})

let workspace

beforeEach(() => {
  workspace = new Blockly.Workspace()
  window.threeObjStore = {}
})

const vec3 = (x, y, z) => {
  const block = workspace.newBlock('linalg_vec3')
  block.setFieldValue(x, 'X')
  block.setFieldValue(y, 'Y')
  block.setFieldValue(z, 'Z')
  return block
}

const plug = (parent, input, child) =>
  parent.getInput(input).connection.connect(child.outputConnection)

function run() {
  const code = javascriptGenerator.workspaceToCode(workspace)
  const args = installSceneRuntime(workspace)
  new Function(...RUNTIME_PARAM_NAMES, code)(...args)
  return window.threeObjStore
}

// Last length each glyph was grown to, so a stage that does nothing is visible
// to the test even when the glyph is already on screen at full size.
function trackLengths(...objects) {
  const lengths = new Map()
  for (const object of objects) {
    const grow = object.userData.setVectorLength
    object.userData.setVectorLength = (length) => {
      lengths.set(object, length)
      grow(length)
    }
  }
  return (object) => lengths.get(object)
}

describe('vector_arithmetic staged reveal', () => {
  // 3*V1 from the origin, in the socket the arithmetic block's own V input
  // would otherwise fill.
  function scaleBy(k) {
    const scale = workspace.newBlock('vector_scale')
    const scalar = workspace.newBlock('scalar')
    scalar.setFieldValue(k, 'scalar')
    plug(scale, 'K', scalar)
    plug(scale, 'V', vec3(1, 1, 1))
    return scale
  }

  // V3 "from point:" the tip of the other operand -- the head-to-tail sum.
  function headToTailSum(tip) {
    const arithmetic = workspace.newBlock('vector_arithmetic')
    const hanging = vec3(1, -2, 1)
    plug(arithmetic, 'U', hanging)
    plug(hanging, 'ORIGIN', vec3(...tip))
    return arithmetic
  }

  it('grows the arrow that supplies the other tail first, whatever socket it is in', () => {
    const arithmetic = headToTailSum([1, 3, 2])
    plug(arithmetic, 'V', vec3(1, 3, 2))
    const store = run()

    const hanging = store[`${arithmetic.id}_u`]
    const fromOrigin = store[`${arithmetic.id}_v`]
    const lengthOf = trackLengths(hanging, fromOrigin)

    store[arithmetic.id].userData.animate(0.2)
    expect(lengthOf(fromOrigin)).toBeGreaterThan(0)
    expect(lengthOf(hanging)).toBe(0)
    expect(hanging.visible).toBe(false)

    store[arithmetic.id].userData.animate(0.5)
    expect(lengthOf(hanging)).toBeGreaterThan(0)
    expect(hanging.visible).toBe(true)
  })

  it('leaves an operand another block already draws to that block', () => {
    const arithmetic = headToTailSum([3, 3, 3])
    plug(arithmetic, 'V', scaleBy(3))

    const store = run()

    // Scale Vector already draws 3*V1 from the origin: no coincident copy, and
    // no second label for it.
    expect(store[`${arithmetic.id}_v`]).toBeUndefined()
    expect(store[`${arithmetic.id}_u`]).toBeDefined()
    expect(store[`${arithmetic.id}_r`]).toBeDefined()
    expect(store[arithmetic.id].userData.labels.some((label) => label.anchor === 'vTip')).toBe(
      false,
    )
  })

  it('starts from an empty scene -- the owner picture plays inside its slot', () => {
    const arithmetic = headToTailSum([3, 3, 3])
    const scale = scaleBy(3)
    plug(arithmetic, 'V', scale)

    const store = run()
    const source = store[`${scale.id}_v`] // V1, the Scale Vector block's input
    const scaled = store[`${scale.id}_s`] // 3*V1
    const lengthOf = trackLengths(source, scaled)

    store[arithmetic.id].userData.animate(0)
    expect(lengthOf(source)).toBe(0)
    expect(lengthOf(scaled)).toBe(0)
    expect(source.visible).toBe(false)
    expect(scaled.visible).toBe(false)

    // Every arrow gets a slot of the same length, nested or not: V1 owns the
    // first quarter of the run, 3*V1 the second.
    store[arithmetic.id].userData.animate(0.2)
    expect(lengthOf(source)).toBeGreaterThan(0)
    expect(lengthOf(scaled)).toBe(0)

    store[arithmetic.id].userData.animate(0.3)
    expect(lengthOf(source)).toBeCloseTo(Math.sqrt(3))
    expect(lengthOf(scaled)).toBeGreaterThan(0)

    store[arithmetic.id].userData.animate(1)
    expect(lengthOf(source)).toBeCloseTo(Math.sqrt(3))
    expect(lengthOf(scaled)).toBeCloseTo(Math.sqrt(27))
    expect(source.visible).toBe(true)
  })

  it('still grows that operand -- the owner arrow is what the stage drives', () => {
    const arithmetic = headToTailSum([3, 3, 3])
    const scale = scaleBy(3)
    plug(arithmetic, 'V', scale)

    const store = run()
    const owned = store[`${scale.id}_s`] // 3*V1, drawn by Scale Vector
    const hanging = store[`${arithmetic.id}_u`]
    const lengthOf = trackLengths(owned, hanging)

    // Four arrows, four quarters: 3*V1 owns the second one.
    store[arithmetic.id].userData.animate(0.4)
    expect(lengthOf(owned)).toBeGreaterThan(0)
    expect(lengthOf(owned)).toBeLessThan(Math.sqrt(27))
    expect(lengthOf(hanging)).toBe(0)

    store[arithmetic.id].userData.animate(1)
    expect(lengthOf(owned)).toBeCloseTo(Math.sqrt(27))
    expect(owned.visible).toBe(true)
  })
})

describe('vector_scale staged reveal', () => {
  const scaleBy = (k) => {
    const scale = workspace.newBlock('vector_scale')
    const scalar = workspace.newBlock('scalar')
    scalar.setFieldValue(k, 'scalar')
    plug(scale, 'K', scalar)
    plug(scale, 'V', vec3(1, 3, 2))
    return scale
  }

  it('grows both arrows together at k = 1, where they are the same arrow', () => {
    const scale = scaleBy(1)
    const store = run()
    const source = store[`${scale.id}_v`]
    const scaled = store[`${scale.id}_s`]
    const lengthOf = trackLengths(source, scaled)

    store[scale.id].userData.animate(0.5)
    expect(lengthOf(scaled)).toBeCloseTo(lengthOf(source))
    expect(lengthOf(scaled)).toBeGreaterThan(0)
  })

  it('keeps a stage each when the two arrows differ', () => {
    const scale = scaleBy(2)
    const store = run()
    const source = store[`${scale.id}_v`]
    const scaled = store[`${scale.id}_s`]
    const lengthOf = trackLengths(source, scaled)

    store[scale.id].userData.animate(0.4)
    expect(lengthOf(source)).toBeGreaterThan(0)
    expect(lengthOf(scaled)).toBe(0)
  })

  it('does not reveal a source arrow the settings have switched off', () => {
    const scale = scaleBy(2)
    const store = run()
    const source = store[`${scale.id}_v`]
    source.visible = false
    source.userData.hiddenBySetting = true

    store[scale.id].userData.animate(1)
    expect(source.visible).toBe(false)
  })
})
