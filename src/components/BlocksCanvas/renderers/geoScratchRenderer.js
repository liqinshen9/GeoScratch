import * as Blockly from 'blockly/core'

export const GEOSCRATCH_RENDERER = 'geoscratch'

let REGISTERED = false

/**
 * Marks inputs whose connected child may hang past its row rather than stretch
 * it. Blockly sizes a value-input's row to the child's height and pushes rows
 * below it down; on a block like linalg_vec3 (socket on the top row) that
 * shoves the block's own label far down. Listed blocks keep their layout and
 * let the child overflow off the right edge.
 *
 * @param {import('blockly/core').Block} block
 * @param {...string} inputNames
 */
export function allowOverflowingInputs(block, ...inputNames) {
  block.geoScratchOverflowInputs = new Set(inputNames)
}

function overflows(block, input) {
  return Boolean(input?.name) && Boolean(block?.geoScratchOverflowInputs?.has(input.name))
}

export function registerGeoScratchRenderer() {
  if (REGISTERED) return GEOSCRATCH_RENDERER
  REGISTERED = true

  class GeoScratchRenderInfo extends Blockly.geras.RenderInfo {
    addInput_(input, activeRow) {
      super.addInput_(input, activeRow)
      if (!overflows(this.block_, input)) return

      const elem = activeRow.elements[activeRow.elements.length - 1]
      // `shape.height` is the height Blockly gives this same measurable when
      // nothing is connected, so the row ends up exactly as tall as it would
      // be with an empty socket.
      if (Blockly.blockRendering.Types.isExternalInput(elem) && elem.shape?.height) {
        elem.height = elem.shape.height
      }
    }
  }

  class GeoScratchRenderer extends Blockly.geras.Renderer {
    makeRenderInfo_(block) {
      return new GeoScratchRenderInfo(this, block)
    }
  }

  Blockly.blockRendering.register(GEOSCRATCH_RENDERER, GeoScratchRenderer)
  return GEOSCRATCH_RENDERER
}
