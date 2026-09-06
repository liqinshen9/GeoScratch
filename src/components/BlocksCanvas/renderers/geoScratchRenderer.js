import * as Blockly from 'blockly/core'

export const GEOSCRATCH_RENDERER = 'geoscratch'

let REGISTERED = false

/**
 * Marks inputs on a block whose connected child should be allowed to hang past
 * the bottom of its row instead of stretching it.
 *
 * Blockly sizes the row an external value input sits on to the height of
 * whatever is plugged into it, then pushes every row below it down. On a block
 * like linalg_vec3 -- whose socket is deliberately on the top row so a
 * connected block lines up with its top edge -- that means plugging anything
 * tall in shoves the block's own label and coordinates far down the body.
 * Blocks listed here keep their own layout and let the child overflow
 * alongside them instead; the child is drawn from the block's right edge, so
 * it sits next to the body rather than over it.
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
