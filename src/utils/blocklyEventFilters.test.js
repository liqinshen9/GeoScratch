import { describe, it, expect } from 'vitest'
import * as Blockly from 'blockly/core'
import { blockMoveChangesGeneratedCode, shouldIgnoreWorkspaceChange } from './blocklyEventFilters'

describe('blockMoveChangesGeneratedCode', () => {
  it('is true when the parent block id changes', () => {
    expect(blockMoveChangesGeneratedCode({
      oldParentId: 'a', newParentId: 'b',
      oldInputName: 'X', newInputName: 'X',
      oldNextBlockId: null, newNextBlockId: null,
    })).toBe(true)
  })

  it('is true when the input name changes', () => {
    expect(blockMoveChangesGeneratedCode({
      oldParentId: 'a', newParentId: 'a',
      oldInputName: 'X', newInputName: 'Y',
      oldNextBlockId: null, newNextBlockId: null,
    })).toBe(true)
  })

  it('is true when the next-block chain changes', () => {
    expect(blockMoveChangesGeneratedCode({
      oldParentId: 'a', newParentId: 'a',
      oldInputName: 'X', newInputName: 'X',
      oldNextBlockId: 'n1', newNextBlockId: 'n2',
    })).toBe(true)
  })

  it('is false for a pure drag that leaves parent/input/chain untouched (e.g. a nudge on the canvas)', () => {
    expect(blockMoveChangesGeneratedCode({
      oldParentId: 'a', newParentId: 'a',
      oldInputName: 'X', newInputName: 'X',
      oldNextBlockId: 'n1', newNextBlockId: 'n1',
    })).toBe(false)
  })
})

describe('shouldIgnoreWorkspaceChange', () => {
  it('ignores a missing event', () => {
    expect(shouldIgnoreWorkspaceChange(null)).toBe(true)
    expect(shouldIgnoreWorkspaceChange(undefined)).toBe(true)
  })

  it('ignores viewport-change events (pan/zoom, not a code edit)', () => {
    expect(shouldIgnoreWorkspaceChange({ type: Blockly.Events.VIEWPORT_CHANGE })).toBe(true)
  })

  it('ignores other UI events (e.g. selection) that are not a block-change event', () => {
    expect(shouldIgnoreWorkspaceChange({ type: Blockly.Events.SELECTED, isUiEvent: true })).toBe(true)
  })

  it('does not ignore a UI-flagged block-change event', () => {
    expect(shouldIgnoreWorkspaceChange({ type: Blockly.Events.BLOCK_CHANGE, isUiEvent: true })).toBe(false)
  })

  it('ignores a block move that does not affect generated code', () => {
    expect(shouldIgnoreWorkspaceChange({
      type: Blockly.Events.BLOCK_MOVE,
      oldParentId: 'a', newParentId: 'a',
      oldInputName: 'X', newInputName: 'X',
      oldNextBlockId: null, newNextBlockId: null,
    })).toBe(true)
  })

  it('does not ignore a block move that reparents the block', () => {
    expect(shouldIgnoreWorkspaceChange({
      type: Blockly.Events.BLOCK_MOVE,
      oldParentId: 'a', newParentId: 'b',
      oldInputName: 'X', newInputName: 'X',
      oldNextBlockId: null, newNextBlockId: null,
    })).toBe(false)
  })

  it('does not ignore other non-UI structural events, e.g. block create/delete', () => {
    expect(shouldIgnoreWorkspaceChange({ type: Blockly.Events.BLOCK_CREATE })).toBe(false)
    expect(shouldIgnoreWorkspaceChange({ type: Blockly.Events.BLOCK_DELETE })).toBe(false)
  })
})
