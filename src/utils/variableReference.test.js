import { describe, it, expect } from 'vitest'
import * as Blockly from 'blockly/core'
import {
  setRefTarget,
  getRefTarget,
  resolveRefTargetBlock,
  wrapperCode,
  referenceCode,
  fallbackExpressionFor,
} from './variableReference'
import { readBlockData } from './namingRegistry'

// Minimal stand-ins: the wrapper is a value block with a VALUE input, the
// reference a bare value block. Their identity comes from block.data, not
// from any field, so no rendering/colour machinery is needed here.
Blockly.Blocks['geo_variable'] = {
  init() {
    this.appendValueInput('VALUE')
    this.setOutput(true, null)
  },
}
Blockly.Blocks['geo_variable_ref'] = {
  init() {
    this.appendDummyInput()
    this.setOutput(true, null)
  },
}
Blockly.Blocks['test_vector_source'] = {
  init() {
    this.setOutput(true, 'vector3')
  },
}
Blockly.Blocks['test_scalar_source'] = {
  init() {
    this.setOutput(true, 'scalar')
  },
}

function makeWrapper(ws, refId, innerType) {
  const wrapper = ws.newBlock('geo_variable')
  wrapper.data = JSON.stringify({
    geoScratchNaming: { kind: 'variable', number: 1, custom: null, refId },
  })
  if (innerType) {
    const inner = ws.newBlock(innerType)
    wrapper.getInput('VALUE').connection.connect(inner.outputConnection)
  }
  return wrapper
}

function makeReference(ws, targetRefId, lastKnownName = 'Var1') {
  const reference = ws.newBlock('geo_variable_ref')
  setRefTarget(reference, targetRefId, lastKnownName)
  return reference
}

describe('variableReference', () => {
  it('stores the wrapped value under the wrapper refId, evaluating it exactly once', () => {
    const code = wrapperCode('ref-a', 'makeInner()')
    expect(code).toBe('geoSetVar("ref-a", makeInner())')
    expect(code.match(/makeInner\(\)/g)).toHaveLength(1)
  })

  it('reads the value back by refId', () => {
    expect(referenceCode('ref-a', 'null')).toBe('geoVar("ref-a", null)')
  })

  it('resolves a reference to the wrapper carrying that refId', () => {
    const ws = new Blockly.Workspace()
    const wrapper = makeWrapper(ws, 'ref-a')
    const reference = makeReference(ws, 'ref-a')
    expect(resolveRefTargetBlock(reference)).toBe(wrapper)
  })

  it('resolves to null once the wrapper is gone', () => {
    const ws = new Blockly.Workspace()
    const reference = makeReference(ws, 'ref-missing')
    expect(resolveRefTargetBlock(reference)).toBeNull()
  })

  it('picks a fallback matching what the wrapper holds', () => {
    const ws = new Blockly.Workspace()
    makeWrapper(ws, 'ref-vec', 'test_vector_source')
    expect(fallbackExpressionFor(makeReference(ws, 'ref-vec'))).toBe('new THREE.Vector3()')

    makeWrapper(ws, 'ref-num', 'test_scalar_source')
    expect(fallbackExpressionFor(makeReference(ws, 'ref-num'))).toBe('0')
  })

  it('falls back to null for a dangling reference rather than emitting undefined', () => {
    const ws = new Blockly.Workspace()
    const reference = makeReference(ws, 'ref-missing', 'Origin')
    // `undefined` here would throw inside a consumer and, via
    // generateAndRun's catch, silently blank the entire 3D scene.
    expect(fallbackExpressionFor(reference)).toBe('null')
    expect(referenceCode('ref-missing', fallbackExpressionFor(reference))).toBe('geoVar("ref-missing", null)')
  })

  it('keeps the ref target and the naming record in separate namespaces', () => {
    const ws = new Blockly.Workspace()
    const reference = ws.newBlock('geo_variable_ref')
    reference.data = JSON.stringify({
      geoScratchNaming: { kind: 'variable', number: 4, custom: null, refId: 'ref-self' },
    })
    setRefTarget(reference, 'ref-target', 'Origin')

    expect(getRefTarget(reference)).toEqual({ targetRefId: 'ref-target', lastKnownName: 'Origin' })
    expect(readBlockData(reference, 'geoScratchNaming').refId).toBe('ref-self')
  })
})
