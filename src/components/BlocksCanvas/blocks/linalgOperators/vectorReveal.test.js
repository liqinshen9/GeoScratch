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

describe('vector_arithmetic subtraction', () => {
  // u = (1, -4, 1), v = (1, 3, 1): u - v = (0, -7, 0).
  function subtract({ vFrom } = {}) {
    const minus = workspace.newBlock('vector_arithmetic')
    minus.setFieldValue('subtract', 'OP')
    plug(minus, 'U', vec3(1, -4, 1))
    const v = vec3(1, 3, 1)
    if (vFrom) plug(v, 'ORIGIN', vec3(...vFrom))
    plug(minus, 'V', v)
    const store = run()
    const group = store[minus.id]
    return {
      group,
      result: store[minus.id + '_r'],
      arrowU: store[minus.id + '_u'],
      arrowV: store[minus.id + '_v'],
      negated: group.children.find(
        (child) => child.userData?.vectorOrigin && child.visible === false,
      ),
    }
  }

  const length = (glyph) => glyph.userData.vectorLength
  const V_LENGTH = Math.hypot(1, 3, 1)

  it('keeps -v off the static scene', () => {
    const { negated, result } = subtract()
    expect(negated).toBeTruthy()
    expect(negated.visible).toBe(false)
    expect(result.visible).toBe(true)
  })

  // u, then v with -v, then the result, then two slots to hold and fade -v: five.
  it('grows u first, on its own', () => {
    const { group, arrowU, arrowV, negated, result } = subtract()
    expect(group.userData.animate.stages).toBe(5)
    // The fade's extra slot adds time rather than squeezing the others.
    expect(group.userData.animate.durationScale).toBeCloseTo(5 / 4, 9)

    group.userData.animate(0.5 / 5)
    expect(arrowU.visible).toBe(true)
    expect(arrowV.visible).toBe(false)
    expect(negated.visible).toBe(false)
    expect(result.visible).toBe(false)
  })

  it('grows v and -v together, both from v tail', () => {
    const { group, arrowV, negated, result } = subtract()
    group.userData.animate(1.5 / 5)
    expect(arrowV.visible).toBe(true)
    expect(negated.visible).toBe(true)
    expect(length(negated)).toBeCloseTo(length(arrowV), 9)
    expect(length(negated)).toBeCloseTo(V_LENGTH / 2, 9)
    expect(negated.userData.vectorOrigin.toArray()).toEqual([0, 0, 0])
    const direction = negated.userData.vectorDirection.toArray()
    ;[-1, -3, -1].forEach((c, i) => expect(direction[i]).toBeCloseTo(c / V_LENGTH, 9))
    expect(result.visible).toBe(false)
  })

  it('then grows the result from the origin, with -v still up', () => {
    const { group, negated, result } = subtract()
    group.userData.animate(2.5 / 5)
    expect(negated.visible).toBe(true)
    expect(length(negated)).toBeCloseTo(V_LENGTH, 9)
    expect(result.visible).toBe(true)
    expect(result.userData.vectorOrigin.toArray()).toEqual([0, 0, 0])
    expect(length(result)).toBeCloseTo(7 / 2, 9)
  })

  it('keeps -v up for a moment after the result has finished', () => {
    const { group, negated, result } = subtract()
    group.userData.animate(3.2 / 5)
    expect(length(result)).toBeCloseTo(7, 9)
    expect(negated.visible).toBe(true)
    expect(length(negated)).toBeCloseTo(V_LENGTH, 9)
    expect(negated.userData.glyphOpacity).toBe(1)
  })

  // The last two slots hold for their first 20%, then fade over the rest.
  it('then fades -v out rather than cutting it', () => {
    const { group, negated } = subtract()
    group.userData.animate(3.7 / 5)
    expect(negated.visible).toBe(true)
    expect(negated.userData.glyphOpacity).toBeCloseTo(1 - 0.15 / 0.8, 9)

    group.userData.animate(4.6 / 5)
    expect(negated.userData.glyphOpacity).toBeCloseTo(1 - 0.6 / 0.8, 9)

    // Scrubbing back brings it back whole.
    group.userData.animate(2.5 / 5)
    expect(negated.userData.glyphOpacity).toBe(1)
  })

  it('takes -v away at rest', () => {
    const { group, arrowU, arrowV, negated, result } = subtract()
    group.userData.animate(0.5)
    group.userData.animate(1)
    expect(negated.visible).toBe(false)
    // Opaque again, so the next play starts from a whole arrow.
    expect(negated.userData.glyphOpacity).toBe(1)
    expect(arrowU.visible).toBe(true)
    expect(arrowV.visible).toBe(true)
    expect(length(result)).toBeCloseTo(7, 9)
  })

  // -v follows v's tail, which the student controls: hang v off u's tip and
  // -v hangs there too, head to tail.
  it('draws -v from wherever v is drawn from', () => {
    const { group, negated } = subtract({ vFrom: [1, -4, 1] })
    group.userData.animate(0.5)
    expect(negated.userData.vectorOrigin.toArray()).toEqual([1, -4, 1])
  })

  it('shows the -v label only while -v is on screen', () => {
    const { group } = subtract()
    const label = group.userData.labels.find((l) => l.anchor === 'negTip')
    expect(label.name).toBe('\u2212' + group.userData.labels.find((l) => l.anchor === 'vTip').name)

    group.userData.animate(0.5 / 5)
    expect(label.revealed()).toBe(false)
    group.userData.animate(1.5 / 5)
    expect(label.revealed()).toBe(true)
    group.userData.animate(3.5 / 5)
    expect(label.revealed()).toBe(true)
    // Goes once the arrow is more than half faded.
    group.userData.animate(4.6 / 5)
    expect(label.revealed()).toBe(false)
    group.userData.animate(1)
    expect(label.revealed()).toBe(false)
  })
})

describe('vector_arithmetic point difference', () => {
  // P = (-9, 8, 7), Q = (3, -2, 5): P - Q = (-12, 10, 2), drawn from Q.
  const point = (x, y, z) => {
    const block = workspace.newBlock('linalg_point')
    block.setFieldValue(x, 'X')
    block.setFieldValue(y, 'Y')
    block.setFieldValue(z, 'Z')
    return block
  }

  function pointDifference() {
    const minus = workspace.newBlock('vector_arithmetic')
    minus.setFieldValue('subtract', 'OP')
    plug(minus, 'U', point(-9, 8, 7))
    plug(minus, 'V', point(3, -2, 5))
    const store = run()
    const group = store[minus.id]
    const result = store[minus.id + '_r']
    const [guideP, guideQ] = group.children.filter((child) => child !== result)
    return { group, result, guideP, guideQ }
  }

  const length = (glyph) => glyph.userData.vectorLength
  const DIFFERENCE = Math.hypot(12, 10, 2)

  it('draws only the difference when nothing is playing', () => {
    const { result, guideP, guideQ } = pointDifference()
    expect(result.visible).toBe(true)
    expect(guideP.visible).toBe(false)
    expect(guideQ.visible).toBe(false)
    expect(result.userData.vectorOrigin.toArray()).toEqual([3, -2, 5])
  })

  // P and Q take a slot each, the difference two: grow at the origin, slide.
  it('grows P, then Q, from the origin before the difference', () => {
    const { group, result, guideP, guideQ } = pointDifference()
    expect(group.userData.animate.stages).toBe(4)

    group.userData.animate(0.5 / 4)
    expect(guideP.visible).toBe(true)
    expect(length(guideP)).toBeCloseTo(Math.hypot(9, 8, 7) / 2, 9)
    expect(guideP.userData.vectorOrigin.toArray()).toEqual([0, 0, 0])
    expect(guideQ.visible).toBe(false)
    expect(result.visible).toBe(false)

    group.userData.animate(1.5 / 4)
    expect(length(guideP)).toBeCloseTo(Math.hypot(9, 8, 7), 9)
    expect(guideQ.visible).toBe(true)
    expect(result.visible).toBe(false)
  })

  // Drawn first as the free vector it is, so it cannot be mistaken for P.
  it('grows the difference out of the origin', () => {
    const { group, result, guideP, guideQ } = pointDifference()
    group.userData.animate(2.5 / 4)
    expect(guideP.visible).toBe(true)
    expect(guideQ.visible).toBe(true)
    expect(result.visible).toBe(true)
    expect(result.userData.vectorOrigin.toArray()).toEqual([0, 0, 0])
    expect(length(result)).toBeCloseTo(DIFFERENCE / 2, 9)
  })

  it('then slides it over to run from Q to P, label and all', () => {
    const { group, result } = pointDifference()
    group.userData.animate(3.5 / 4)
    const halfway = [1.5, -1, 2.5]
    result.userData.vectorOrigin.toArray().forEach((c, i) => expect(c).toBeCloseTo(halfway[i], 9))
    expect(length(result)).toBeCloseTo(DIFFERENCE, 9)
    // The label sits at the arrow's midpoint, lifted the same as at rest.
    const rest = [(3 - 9) / 2, (-2 + 8) / 2 + 0.35, (5 + 7) / 2]
    const shift = [-1.5, 1, -2.5]
    group.userData.labelAnchors.rTip.position.forEach((c, i) =>
      expect(c).toBeCloseTo(rest[i] + shift[i], 9),
    )
  })

  it('takes the guides away at rest, leaving the static scene', () => {
    const { group, result, guideP, guideQ } = pointDifference()
    group.userData.animate(0.6)
    group.userData.animate(1)
    expect(guideP.visible).toBe(false)
    expect(guideQ.visible).toBe(false)
    expect(result.visible).toBe(true)
    expect(length(result)).toBeCloseTo(DIFFERENCE, 9)
    expect(result.userData.vectorOrigin.toArray()).toEqual([3, -2, 5])
    const labelAtRest = group.userData.labelAnchors.rTip.position
    ;[-3, 3.35, 6].forEach((c, i) => expect(labelAtRest[i]).toBeCloseTo(c, 9))
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
