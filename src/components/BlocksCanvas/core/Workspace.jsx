import InitLocale from "./Locale"
import * as en from 'blockly/msg/en'
import * as Blockly from 'blockly/core'
import { GEO_SCRATCH_BLOCK_THEME } from '@/components/BlocksCanvas/blocks/blockColours'

let CONTEXT_MENU_CONFIGURED = false

function configureContextMenu() {
  if (CONTEXT_MENU_CONFIGURED) return
  CONTEXT_MENU_CONFIGURED = true

  const registry = Blockly.ContextMenuRegistry.registry
  if (registry.getItem('blockInline')) {
    registry.unregister('blockInline')
  }
}

const Workspace = (hostElement) => {
  InitLocale(en)
  configureContextMenu()

  return Blockly.inject(hostElement, {
    renderer: 'geras',
    grid: { spacing: 20, length: 3, colour: '#e2e8f0', snap: false },
    zoom: { controls: true, wheel: true, startScale: 0.72, minScale: 0.5, maxScale: 2 },
    trashcan: true,
    theme: GEO_SCRATCH_BLOCK_THEME,
    move: { scrollbars: false, drag: true, wheel: true },
  })
}

export default Workspace