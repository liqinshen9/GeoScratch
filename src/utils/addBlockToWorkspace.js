//click a block in the palette, add it to the main canvas
//place it near the center of the view, avoiding overlap with existing blocks.

import * as Blockly from 'blockly/core'

const GAP = 20

function getViewCenter(workspace) {
  const m = workspace.getMetrics()
  return {
    x: m.viewLeft + m.viewWidth / 2,
    y: m.viewTop + m.viewHeight / 2,
  }
}

function blockRect(block) {
  const { x, y } = block.getRelativeToSurfaceXY()
  const { width, height } = block.getHeightWidth()
  return { x, y, width, height }
}

function overlaps(a, b) {
  return !(
    a.x + a.width + GAP <= b.x ||
    b.x + b.width + GAP <= a.x ||
    a.y + a.height + GAP <= b.y ||
    b.y + b.height + GAP <= a.y
  )
}

//spiral outward from the center until we find a free rectangle.
function findOpenSpot(workspace, newBlock) {
  const center = getViewCenter(workspace)
  const hw = newBlock.getHeightWidth()
  const occupied = workspace
    .getTopBlocks(true)
    .filter((b) => b.id !== newBlock.id)
    .map(blockRect)

  const cellW = hw.width + GAP
  const cellH = hw.height + GAP

  for (let ring = 0; ring < 12; ring++) {
    for (let col = -ring; col <= ring; col++) {
      for (let row = -ring; row <= ring; row++) {
        if (ring > 0 && Math.abs(col) !== ring && Math.abs(row) !== ring) continue

        const x = center.x - hw.width / 2 + col * cellW
        const y = center.y - hw.height / 2 + row * cellH
        const candidate = { x, y, width: hw.width, height: hw.height }

        if (!occupied.some((r) => overlaps(candidate, r))) {
          return { x, y }
        }
      }
    }
  }

  return { x: center.x - hw.width / 2, y: center.y - hw.height / 2 }
}

export function addBlockToWorkspace(workspace, type) {
  if (!workspace || workspace.isFlyout) return

  const group = Blockly.utils.idGenerator.genUid()
  Blockly.Events.setGroup(group)
  try {
    const block = workspace.newBlock(type)
    block.initSvg()
    block.render()

    const { x, y } = findOpenSpot(workspace, block)
    const xy = block.getRelativeToSurfaceXY()
    block.moveBy(x - xy.x, y - xy.y)

    Blockly.svgResize(workspace)
  } finally {
    Blockly.Events.setGroup(false)
  }
}

export default addBlockToWorkspace
