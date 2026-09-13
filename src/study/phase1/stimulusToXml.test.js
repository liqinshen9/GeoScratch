// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'

// colorSystem pulls in @material/material-color-utilities, whose ESM subpath
// doesn't resolve under vitest (same workaround as vectorReveal.test.js).
vi.mock('@/store/colorSystem', () => ({
  forInstance: () => '#3366cc',
  forInstanceVariant: () => '#3366cc',
  forRole: () => '#ff8800',
  subscribeToPreset: () => () => {},
}))

import * as Blockly from 'blockly/core'
import { javascriptGenerator } from 'blockly/javascript'
import defineBlocks from '@/components/BlocksCanvas/blocks'
import { installNamingRegistry, getDisplayName } from '@/utils/namingRegistry'
import { generateStimulusSet } from './stimuli'
import { stimulusToXml, blockIdFor, targetBlockIds } from './stimulusToXml'

const set = generateStimulusSet('xml-test')
const stimulus = set.measured.find((s) => s.clutter === 'high')

function load(s) {
  const workspace = new Blockly.Workspace()
  Blockly.Events.disable()
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(stimulusToXml(s)), workspace)
  } finally {
    Blockly.Events.enable()
  }
  installNamingRegistry(workspace)
  return workspace
}

beforeAll(() => {
  defineBlocks()
})

describe('stimulusToXml', () => {
  it('loads every stimulus object as a top-level block', () => {
    const workspace = load(stimulus)
    const topIds = workspace
      .getTopBlocks(false)
      .map((b) => b.id)
      .sort()
    expect(topIds).toEqual(stimulus.objects.map((o) => blockIdFor(stimulus, o.key)).sort())
    workspace.dispose()
  })

  it('names the targets A and B through the naming registry', () => {
    const workspace = load(stimulus)
    const ids = targetBlockIds(stimulus)
    expect(getDisplayName(workspace.getBlockById(ids.A))).toBe('A')
    expect(getDisplayName(workspace.getBlockById(ids.B))).toBe('B')
    workspace.dispose()
  })

  it('writes the geometry into block fields exactly', () => {
    const workspace = load(stimulus)
    for (const object of stimulus.objects) {
      const block = workspace.getBlockById(blockIdFor(stimulus, object.key))
      if (object.kind === 'point') {
        expect(['X', 'Y', 'Z'].map((f) => Number(block.getFieldValue(f)))).toEqual(object.position)
      }
      if (object.kind === 'line') {
        const pos = block.getInputTargetBlock('POS')
        expect(['X', 'Y', 'Z'].map((f) => Number(pos.getFieldValue(f)))).toEqual(object.origin)
      }
    }
    workspace.dispose()
  })

  it('generates code for the whole scene', () => {
    const workspace = load(stimulus)
    const code = javascriptGenerator.workspaceToCode(workspace)
    for (const object of stimulus.objects) {
      expect(code).toContain(blockIdFor(stimulus, object.key))
    }
    workspace.dispose()
  })

  it('uses the same block ids (and so colours) for a stimulus every time', () => {
    const again = generateStimulusSet('xml-test').measured.find((s) => s.id === stimulus.id)
    expect(stimulusToXml(again)).toBe(stimulusToXml(stimulus))
  })
})
