import InitLocale from "./Locale"
import * as en from 'blockly/msg/en'
import * as Blockly from 'blockly/core'

const Workspace = (hostElement) => {
  InitLocale(en)

  return Blockly.inject(hostElement, {
    renderer: 'geras',
    grid: { spacing: 20, length: 3, colour: '#e2e8f0', snap: false },
    zoom: { controls: true, wheel: true, startScale: 1, minScale: 0.5, maxScale: 2 },
    trashcan: true,
    theme: Blockly.Themes.Classic,
    move: { scrollbars: false, drag: true, wheel: true },
  })
}

export default Workspace