/**
 * Screen-space geometry helpers for rendered Blockly blocks. Split out from
 * BlocksCanvas because they are pure DOM measurement with no React or workspace
 * state involved -- and because the trash-drop hit test they drive is easy to
 * get subtly wrong.
 */

/**
 * Overlap area of two DOMRect-shaped objects, in square pixels. 0 when they
 * merely touch along an edge, so a block resting exactly against the trash
 * button's padded box does not count as dropped on it.
 */
export function getRectIntersectionArea(rectA, rectB) {
  if (!rectA || !rectB) return 0

  const width = Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left)
  const height = Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top)
  return Math.max(0, width) * Math.max(0, height)
}

/**
 * The block's own outline rect, preferring its primary path over its SVG root.
 * The root's box also spans attached child blocks, which would make a tall stack
 * register as touching the trash while its visible top sits far away.
 */
export function getPrimaryBlockRect(block) {
  const root = block?.getSvgRoot?.()
  const primaryPath =
    block?.pathObject?.svgPath ||
    block?.pathObject?.svgPath_ ||
    root?.querySelector?.('.blocklyPath')

  return primaryPath?.getBoundingClientRect?.() || root?.getBoundingClientRect?.()
}

/** Short human-readable name for a block, for the recently-deleted list. */
export function getDeletedBlockLabel(block) {
  return block.toString?.(48) || block.type || 'Deleted block'
}

/**
 * A standalone SVG snapshot of a block, used as the thumbnail in the trash
 * panel. The transform is stripped and the viewBox set from the block's own
 * bounds so the clone renders at the origin instead of at its workspace offset.
 */
export function getBlockPreviewSvg(block) {
  const root = block.getSvgRoot?.()
  const bounds = root?.getBBox?.()
  if (!root || !bounds?.width || !bounds?.height) return ''

  const clone = root.cloneNode(true)
  clone.removeAttribute('transform')
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${Math.floor(bounds.x)} ${Math.floor(bounds.y)} ${Math.ceil(bounds.width)} ${Math.ceil(bounds.height)}">
      ${clone.outerHTML}
    </svg>
  `
}
