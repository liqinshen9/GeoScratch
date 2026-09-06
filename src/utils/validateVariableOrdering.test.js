import { describe, it, expect } from 'vitest'
import * as Blockly from 'blockly/core'
import { validateVariableOrdering } from './validateVariableOrdering'
import { setRefTarget } from './variableReference'

// Minimal stand-ins for the real variables_set_obj3D/variables_get_obj3D
// shape (a statement block with a VAR field; a value block with a VAR
// field) -- enough for validateVariableOrdering's stack-walk, without any
// of the real geometry/codegen machinery. The 'VAR' field here just holds a
// plain string; resolveGetVarName's `getVariableById(id)?.name ?? id`
// fallback means an id with no matching real variable is used as-is, which
// is fine for exercising the ordering logic in isolation.
Blockly.Blocks['variables_set_obj3D'] = {
  init() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput(''), 'VAR')
    this.setPreviousStatement(true, null)
    this.setNextStatement(true, null)
  },
}
Blockly.Blocks['variables_get_obj3D'] = {
  init() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput(''), 'VAR')
    this.setOutput(true, null)
  },
}
// The variable wrapper pair. Both are plain value blocks here; the wrapper's
// identity comes from its naming refId (written straight into block.data) and
// the reference's from its own geoScratchVarRef payload.
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

// setWarningText is a documented no-op on the headless base Block class
// (real rendering is a BlockSvg/icon-registry concern with no matching
// getter in this version either) -- spy on the calls directly instead of
// trying to read the state back, which is robust either way.
function spyOnWarnings(block) {
  const calls = []
  block.setWarningText = (text, id) => calls.push({ text, id })
  return calls
}

function makeSetBlock(ws, varName) {
  const block = ws.newBlock('variables_set_obj3D')
  block.setFieldValue(varName, 'VAR')
  return block
}

function makeGetBlock(ws, varName) {
  const block = ws.newBlock('variables_get_obj3D')
  block.setFieldValue(varName, 'VAR')
  return block
}

function latestWarning(calls) {
  return calls.length ? calls[calls.length - 1].text : null
}

function makeWrapper(ws, refId, name) {
  const block = ws.newBlock('geo_variable')
  block.data = JSON.stringify({
    geoScratchNaming: { kind: 'variable', number: 1, custom: name, refId },
  })
  return block
}

function makeReference(ws, refId, lastKnownName) {
  const block = ws.newBlock('geo_variable_ref')
  setRefTarget(block, refId, lastKnownName)
  return block
}

describe('validateVariableOrdering', () => {
  it("warns a get block whose stack precedes its variable's set-containing stack", () => {
    const ws = new Blockly.Workspace()
    const getBlock = makeGetBlock(ws, 'myVar') // top-level stack 0
    const calls = spyOnWarnings(getBlock)
    makeSetBlock(ws, 'myVar') // top-level stack 1 -- comes after

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toMatch(/before it is set/)
  })

  it('does not warn when the set-containing stack comes first', () => {
    const ws = new Blockly.Workspace()
    makeSetBlock(ws, 'myVar') // stack 0
    const getBlock = makeGetBlock(ws, 'myVar') // stack 1 -- comes after
    const calls = spyOnWarnings(getBlock)

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toBeNull()
  })

  it('warns a get block whose variable is never set anywhere', () => {
    const ws = new Blockly.Workspace()
    const getBlock = makeGetBlock(ws, 'neverSet')
    const calls = spyOnWarnings(getBlock)

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toMatch(/is never set/)
  })

  it('warns a variable reference whose wrapper sits below it on the canvas', () => {
    const ws = new Blockly.Workspace()
    const reference = makeReference(ws, 'ref-a', 'Origin') // stack 0
    const calls = spyOnWarnings(reference)
    makeWrapper(ws, 'ref-a', 'Origin') // stack 1 -- generated after

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toMatch(/uses "Origin" before it is set/)
  })

  it('does not warn a variable reference whose wrapper comes first', () => {
    const ws = new Blockly.Workspace()
    makeWrapper(ws, 'ref-a', 'Origin') // stack 0
    const reference = makeReference(ws, 'ref-a', 'Origin') // stack 1
    const calls = spyOnWarnings(reference)

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toBeNull()
  })

  it('warns a dangling reference whose wrapper was deleted', () => {
    const ws = new Blockly.Workspace()
    const reference = makeReference(ws, 'ref-gone', 'Origin')
    const calls = spyOnWarnings(reference)

    validateVariableOrdering(ws)

    expect(latestWarning(calls)).toMatch(/"Origin" no longer exists/)
  })

  it('clears a stale warning once the get block sits after a set block for that variable', () => {
    const ws = new Blockly.Workspace()
    const staleGetBlock = makeGetBlock(ws, 'myVar')
    const staleCalls = spyOnWarnings(staleGetBlock)
    validateVariableOrdering(ws)
    expect(latestWarning(staleCalls)).toMatch(/is never set/)

    // Simulates the user deleting the misplaced get block and re-adding one
    // after the set block -- same net effect as moving it, without reaching
    // into the workspace's internal top-block ordering.
    staleGetBlock.dispose()
    makeSetBlock(ws, 'myVar')
    const fixedGetBlock = makeGetBlock(ws, 'myVar')
    const fixedCalls = spyOnWarnings(fixedGetBlock)

    validateVariableOrdering(ws)
    expect(latestWarning(fixedCalls)).toBeNull()
  })
})
