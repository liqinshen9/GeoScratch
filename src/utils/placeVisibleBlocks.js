import * as Blockly from 'blockly/core'

export function placeVisibleBlocks(workspace, blocks, clientRect) {
  if (!blocks.length || !clientRect) return
  const toWorkspace = (x, y) =>
    Blockly.utils.svgMath.screenToWsCoordinates(workspace, new Blockly.utils.Coordinate(x, y))
  const start = toWorkspace(clientRect.left + 24, clientRect.top + 24)
  const end = toWorkspace(clientRect.right - 24, clientRect.bottom - 70)
  const rects = blocks.map((block) => block.getBoundingRectangle())
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const width = Math.max(...rects.map((rect) => rect.right)) - left
  const height = Math.max(...rects.map((rect) => rect.bottom)) - top
  const occupied = workspace
    .getTopBlocks(false)
    .filter((block) => !blocks.includes(block))
    .map((block) => block.getBoundingRectangle())
  const maxX = Math.max(start.x, end.x - width)
  const maxY = Math.max(start.y, end.y - height)
  const candidates = []
  for (let y = start.y; y <= maxY; y += 32) {
    for (let x = start.x; x <= maxX; x += 32) candidates.push({ x, y })
  }
  const center = { x: (start.x + maxX) / 2, y: (start.y + maxY) / 2 }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
  )
  const spot = candidates.find(({ x, y }) =>
    occupied.every(
      (r) =>
        x + width + 20 <= r.left ||
        r.right + 20 <= x ||
        y + height + 20 <= r.top ||
        r.bottom + 20 <= y,
    ),
  ) ?? { x: maxX + 40, y: start.y }
  blocks.forEach((block) => block.moveBy(spot.x - left, spot.y - top))
  if (spot.x > maxX || width > end.x - start.x || height > end.y - start.y) {
    const scale = workspace.scale
    workspace.zoomToFit()
    workspace.setScale(Math.min(scale, workspace.scale))
    workspace.scrollCenter()
  }
}
