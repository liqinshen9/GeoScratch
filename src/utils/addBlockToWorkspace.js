//click a block in the palette, add it to the main canvas
//place it near the center of the view, avoiding overlap with existing blocks.

import * as Blockly from 'blockly/core'
import {
  PIPELINE_DEMO_OBJECT_TYPES,
  TRANSFORM_STEP_BLOCK_TYPES,
} from '@/components/BlocksCanvas/catalog/blockCatalog'

const GAP = 20
const CLICK_CASCADE_OFFSET = 28
const PIPELINE_OBJECT_TYPES = new Set(PIPELINE_DEMO_OBJECT_TYPES)
const PIPELINE_TRANSFORM_TYPES = new Set(TRANSFORM_STEP_BLOCK_TYPES)

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

function getOccupiedRects(workspace, newBlock) {
  return workspace
    .getTopBlocks(true)
    .filter((b) => b.id !== newBlock.id)
    .map(blockRect)
}

function isOpenSpot(candidate, occupied) {
  return !occupied.some((r) => overlaps(candidate, r))
}

function rectAt(x, y, blockSize) {
  return { x, y, width: blockSize.width, height: blockSize.height }
}

function findCascadedOpenSpot(workspace, newBlock, preferredSpot) {
  const hw = newBlock.getHeightWidth()
  const occupied = getOccupiedRects(workspace, newBlock)

  for (let step = 0; step < 16; step += 1) {
    const x = preferredSpot.x + step * CLICK_CASCADE_OFFSET
    const y = preferredSpot.y + step * CLICK_CASCADE_OFFSET
    const candidate = rectAt(x, y, hw)

    if (isOpenSpot(candidate, occupied)) {
      return { x, y }
    }
  }

  return findOpenSpot(workspace, newBlock, preferredSpot)
}

// Spiral outward from the center or a preferred point until we find a free rectangle.
function findOpenSpot(workspace, newBlock, preferredSpot = null) {
  const center = preferredSpot
    ? {
        x: preferredSpot.x + newBlock.getHeightWidth().width / 2,
        y: preferredSpot.y + newBlock.getHeightWidth().height / 2,
      }
    : getViewCenter(workspace)
  const hw = newBlock.getHeightWidth()
  const occupied = getOccupiedRects(workspace, newBlock)

  const cellW = hw.width + GAP
  const cellH = hw.height + GAP

  for (let ring = 0; ring < 12; ring++) {
    for (let col = -ring; col <= ring; col++) {
      for (let row = -ring; row <= ring; row++) {
        if (ring > 0 && Math.abs(col) !== ring && Math.abs(row) !== ring) continue

        const x = center.x - hw.width / 2 + col * cellW
        const y = center.y - hw.height / 2 + row * cellH
        const candidate = rectAt(x, y, hw)

        if (isOpenSpot(candidate, occupied)) {
          return { x, y }
        }
      }
    }
  }

  return { x: center.x - hw.width / 2, y: center.y - hw.height / 2 }
}

function getPipelineAnchor(workspace, block) {
  const metrics = workspace.getMetrics()
  const { width, height } = block.getHeightWidth()
  const centerX = metrics.viewLeft + metrics.viewWidth / 2 - width / 2
  const bottomY = metrics.viewTop + metrics.viewHeight - height - 56
  const topY = metrics.viewTop + 52

  if (block.type === 'transform_pipeline') {
    return { x: centerX, y: topY }
  }

  const topBlocks = workspace.getTopBlocks(true)
  const objectBlocks = topBlocks.filter((b) => PIPELINE_OBJECT_TYPES.has(b.type))
  const transformBlocks = topBlocks.filter((b) => PIPELINE_TRANSFORM_TYPES.has(b.type))

  if (PIPELINE_OBJECT_TYPES.has(block.type)) {
    return { x: centerX, y: bottomY }
  }

  if (PIPELINE_TRANSFORM_TYPES.has(block.type)) {
    const sourceObject = objectBlocks
      .slice()
      .sort((a, b) => b.getRelativeToSurfaceXY().y - a.getRelativeToSurfaceXY().y)[0]

    const baseY = sourceObject
      ? sourceObject.getRelativeToSurfaceXY().y - height - GAP
      : bottomY - height - GAP

    const orderedTransforms = transformBlocks
      .slice()
      .sort((a, b) => b.getRelativeToSurfaceXY().y - a.getRelativeToSurfaceXY().y)

    const y = orderedTransforms.length
      ? orderedTransforms[0].getRelativeToSurfaceXY().y - height - GAP
      : baseY

    return { x: centerX, y }
  }

  return null
}

function clientToWorkspaceXY(workspace, clientX, clientY, block) {
  const { width, height } = block.getHeightWidth()
  const screenCoord = new Blockly.utils.Coordinate(clientX, clientY)
  const wsCoord = Blockly.utils.svgMath.screenToWsCoordinates(workspace, screenCoord)
  return { x: wsCoord.x - width / 2, y: wsCoord.y - height / 2 }
}

export function addBlockToWorkspace(workspace, type, options = {}) {
  if (!workspace || workspace.isFlyout) return null

  const group = Blockly.utils.idGenerator.genUid()
  Blockly.Events.setGroup(group)
  try {
    const block = workspace.newBlock(type)
    block.initSvg()
    block.render()

    // Configure before measuring: a block that collapses itself here is then
    // placed using its small collapsed footprint, not the expanded one.
    options.initBlock?.(block)

    const hasDropPoint = Number.isFinite(options.clientX) && Number.isFinite(options.clientY)

    const anchor = hasDropPoint
      ? null
      : (options.preferredSpot ?? getPipelineAnchor(workspace, block))
    const dropPoint = hasDropPoint
      ? clientToWorkspaceXY(workspace, options.clientX, options.clientY, block)
      : null
    const { x, y } =
      dropPoint ||
      (anchor ? findCascadedOpenSpot(workspace, block, anchor) : findOpenSpot(workspace, block))
    const xy = block.getRelativeToSurfaceXY()
    block.moveBy(x - xy.x, y - xy.y)

    Blockly.svgResize(workspace)
    return block
  } finally {
    Blockly.Events.setGroup(false)
  }
}

export default addBlockToWorkspace
