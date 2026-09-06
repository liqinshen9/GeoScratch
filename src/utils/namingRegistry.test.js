import { describe, it, expect } from 'vitest'
import * as Blockly from 'blockly/core'
import {
  installNamingRegistry,
  getDisplayName,
  setCustomName,
  clearCustomName,
  isNameTaken,
  kindForBlockType,
  refreshNamingCounters,
  findBlockByRefId,
  getRefId,
} from './namingRegistry'

// Minimal stub definitions -- this test only needs `type`/`id`/`data` to
// exist on real Blockly.Block instances (for Blockly.Events.BlockChange and
// workspace.newBlock to work), not any actual rendering or field behaviour.
Blockly.Blocks['geo_vector'] = { init() {} }

// Blockly.Events.fire defers delivery via requestAnimationFrame + setTimeout
// (not synchronous), so a BLOCK_CREATE fired by workspace.newBlock() only
// reaches namingRegistry's installed listener -- and assigns the block its
// name -- after a real tick. Harmless in the app (always some delay before
// a user/test observes the result), but tests must explicitly wait for it.
const flush = () => new Promise((resolve) => setTimeout(resolve, 50))

async function addBlock(workspace, type = 'geo_vector') {
  const block = workspace.newBlock(type)
  await flush()
  return block
}

describe('namingRegistry', () => {
  it('maps known block types to their kind, and unknown types to null', () => {
    expect(kindForBlockType('geo_vector')).toBe('line')
    expect(kindForBlockType('linalg_point')).toBe('point')
    expect(kindForBlockType('not_a_real_type')).toBe(null)
  })

  it('assigns stable, monotonically-numbered names at block-creation time', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const a = await addBlock(ws)
    const b = await addBlock(ws)
    expect(getDisplayName(a)).toBe('L1')
    expect(getDisplayName(b)).toBe('L2')
  })

  it('does not renumber existing blocks when an earlier one is deleted', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const a = await addBlock(ws)
    const b = await addBlock(ws)
    a.dispose()
    const c = await addBlock(ws)
    expect(getDisplayName(b)).toBe('L2')
    expect(getDisplayName(c)).toBe('L3')
  })

  it('formats the same block differently under short vs. descriptive style', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const a = await addBlock(ws)
    expect(getDisplayName(a, 'short')).toBe('L1')
    expect(getDisplayName(a, 'descriptive')).toBe('Line1')
  })

  it('lets a custom name override the auto name, immune to style, and revertible', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const a = await addBlock(ws)
    setCustomName(a, 'MyLine')
    expect(getDisplayName(a, 'short')).toBe('MyLine')
    expect(getDisplayName(a, 'descriptive')).toBe('MyLine')
    clearCustomName(a)
    expect(getDisplayName(a)).toBe('L1')
  })

  it('flags a name as taken by any nameable block, excluding the block asking', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const a = await addBlock(ws)
    setCustomName(a, 'Special')
    expect(isNameTaken(ws, 'Special')).toBe(true)
    expect(isNameTaken(ws, 'Special', a.id)).toBe(false)
    expect(isNameTaken(ws, 'Unused')).toBe(false)
  })

  // Blockly's Duplicate/paste copies block.data verbatim, so a copy arrives
  // already carrying the original's naming record.
  async function duplicate(workspace, original) {
    const copy = workspace.newBlock(original.type)
    copy.data = original.data
    await flush()
    return copy
  }

  it('gives a duplicated block a fresh name instead of the original\'s', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const original = await addBlock(ws)
    expect(getDisplayName(original)).toBe('L1')

    const copy = await duplicate(ws, original)
    expect(getDisplayName(original)).toBe('L1')
    expect(getDisplayName(copy)).toBe('L2')
  })

  it('strips a copied custom name and gives the duplicate its own auto name', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const original = await addBlock(ws)
    setCustomName(original, 'Origin')

    const copy = await duplicate(ws, original)
    expect(getDisplayName(original)).toBe('Origin')
    expect(getDisplayName(copy)).not.toBe('Origin')
    expect(getDisplayName(copy)).toMatch(/^L\d+$/)
  })

  it('gives a duplicate a fresh refId so it cannot hijack the original\'s references', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const original = await addBlock(ws)
    const copy = await duplicate(ws, original)

    expect(getRefId(copy)).toBeTruthy()
    expect(getRefId(copy)).not.toBe(getRefId(original))
    expect(findBlockByRefId(ws, getRefId(original))).toBe(original)
    expect(findBlockByRefId(ws, getRefId(copy))).toBe(copy)
  })

  it('skips a number that a custom-named block is sitting on', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    const first = await addBlock(ws)
    const second = await addBlock(ws)
    setCustomName(second, 'L3') // occupies what would be the next auto name

    const copy = await duplicate(ws, first)
    expect(getDisplayName(copy)).not.toBe('L3')
    expect(isNameTaken(ws, getDisplayName(copy), copy.id)).toBe(false)
  })

  it('does not renumber a reloaded workspace whose blocks all carry unique records', async () => {
    const ws = new Blockly.Workspace()
    const records = [1, 2, 3].map((number) => {
      const block = ws.newBlock('geo_vector')
      block.data = JSON.stringify({
        geoScratchNaming: { kind: 'line', number, custom: null, refId: `ref-${number}` },
      })
      return block
    })
    await flush()

    installNamingRegistry(ws)
    expect(records.map((block) => getDisplayName(block))).toEqual(['L1', 'L2', 'L3'])
  })

  it('continues the sequence after counters are refreshed from a silently-loaded workspace', async () => {
    const ws = new Blockly.Workspace()
    installNamingRegistry(ws)
    // Simulates BlocksCanvas.jsx's restore, which loads with events disabled
    // so the BLOCK_CREATE listener never sees these blocks.
    const restored = ws.newBlock('geo_vector')
    restored.data = JSON.stringify({
      geoScratchNaming: { kind: 'line', number: 7, custom: null, refId: 'ref-7' },
    })
    refreshNamingCounters(ws)

    const next = await addBlock(ws)
    expect(getDisplayName(next)).toBe('L8')
  })

  it('rehydrates its counter from already-persisted block data (e.g. a reloaded workspace)', async () => {
    const ws = new Blockly.Workspace()
    const preExisting = ws.newBlock('geo_vector')
    preExisting.data = JSON.stringify({ geoScratchNaming: { kind: 'line', number: 2, custom: null, refId: 'ref-x' } })
    await flush()

    installNamingRegistry(ws)
    expect(getDisplayName(preExisting)).toBe('L2')

    const next = await addBlock(ws)
    expect(getDisplayName(next)).toBe('L3')
  })
})
