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
    zoom: { controls: false, wheel: true, startScale: 0.72, minScale: 0.5, maxScale: 2 },
    trashcan: false,
    theme: GEO_SCRATCH_BLOCK_THEME,
    // Blockly ties drag-to-pan to `scrollbars` internally -- if scrollbars is
    // false, drag silently collapses to false too, no matter what it's set to
    // here. Scrollbars must stay "on" for panning to work; the scrollbar DOM
    // elements themselves are hidden via CSS instead (see
    // .blocklyScrollbarVertical/.blocklyScrollbarHorizontal).
    // move.wheel stays false so plain wheel doesn't also pan the workspace --
    // that would fight with zoom.wheel below, which we want plain wheel to
    // drive instead. Drag-panning (above) is unaffected by this.
    move: { scrollbars: true, drag: true, wheel: false },
  })
}

export default Workspace