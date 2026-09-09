import * as Blockly from 'blockly/core'
import { Field } from 'blockly/core'
import { blockMoveChangesGeneratedCode } from '@/utils/blocklyEventFilters'
import { formatMatrixHtml } from './homogeneousMatrix.js'

/** @typedef {(block: Block) => string} RenderHtmlFn */

/** @typedef {import('blockly/core').BlockSvg} BlockSvg */
/** @typedef {import('blockly/core').WorkspaceSvg} WorkspaceSvg */
/** @typedef {import('blockly/core').Block} Block */
/** @typedef {'3x3' | '4x4'} MatrixPreviewMode */
/** @typedef {(block: Block) => number[][]} ComputeMatrixFn */

const DRAWER_BUTTON_FIELD_NAMES = ['MATRIX_3X3', 'MATRIX_4X4', 'VECTOR_PREVIEW']
const PIPELINE_TOGGLE_COLOUR = '#5dd979'
const TRANSFORM_STEP_TOGGLE_COLOUR = '#ff914d'
const VECTOR_TOGGLE_COLOUR = '#5dd979'
const TOGGLE_TEXT_COLOUR = '#111827'

/** @type {HTMLDivElement | null} */
let shell = null
/** @type {HTMLDivElement | null} */
let inner = null

/** @type {{
 *   workspace: WorkspaceSvg
 *   blockId: string
 *   field: Field
 *   mode: MatrixPreviewMode | 'vector'
 *   renderHtml: RenderHtmlFn
 * } | null} */
let anchor = null

/** @type {((e: Blockly.Events.Abstract) => void) | null} */
let workspaceListener = null
/** @type {((e: PointerEvent) => void) | null} */
let outsidePointerListener = null
let rafId = 0
let trackRafId = 0

// Exported so other blocks can reserve body height the same way the
// transform pipeline does (an invisible, zero-width field with a forced
// height), which is what makes its body extend below the inputs.
export class FieldMatrixSpacer extends Field {
  /** @type {number} */
  spacerHeight_

  EDITABLE = false
  SERIALIZABLE = false

  /** @param {number} spacerHeightPx */
  constructor(spacerHeightPx) {
    super('\u200b', null)
    this.spacerHeight_ = spacerHeightPx
  }

  isSerializable() {
    return false
  }

  initView() {
    super.initView()
    if (this.textElement_) {
      this.textElement_.style.visibility = 'hidden'
      this.textElement_.style.pointerEvents = 'none'
    }
    if (this.borderRect_) this.borderRect_.style.visibility = 'hidden'
  }

  getDisplayText_() {
    return ''
  }

  updateSize_(margin = 0) {
    this.size_ = new Blockly.utils.Size(1, this.spacerHeight_ + margin)
  }
}

// Shared base for the little coloured drawer-toggle buttons (matrix preview,
// vector-arithmetic preview). Subclasses supply a `mode` tag and an
// html-builder for the drawer body.
class FieldDrawerButton extends Field {
  /** @type {MatrixPreviewMode | 'vector'} */
  mode_
  /** @type {RenderHtmlFn} */
  renderHtml_
  /** @type {boolean} */
  isOpen_ = false

  EDITABLE = false
  SERIALIZABLE = false

  /** @param {string} label @param {MatrixPreviewMode | 'vector'} mode @param {RenderHtmlFn} renderHtml */
  constructor(label, mode, renderHtml) {
    super(label, null)
    this.mode_ = mode
    this.renderHtml_ = renderHtml
  }

  isSerializable() {
    return false
  }

  /** @param {boolean} open */
  setActive(open) {
    this.isOpen_ = open
    this.applyButtonColour()
  }

  getButtonColour() {
    return PIPELINE_TOGGLE_COLOUR
  }

  applyButtonColour() {
    const colour = this.getButtonColour()
    if (this.borderRect_) {
      this.borderRect_.setAttribute('fill', colour)
      this.borderRect_.setAttribute('stroke', colour)
      this.borderRect_.setAttribute('stroke-width', '1.5')
    }
    if (this.textElement_) {
      this.textElement_.setAttribute('font-size', '11px')
      this.textElement_.setAttribute('font-weight', '700')
      this.textElement_.setAttribute('fill', TOGGLE_TEXT_COLOUR)
    }
  }

  initView() {
    super.initView()
    this.applyButtonColour()
  }

  applyColour() {
    super.applyColour()
    this.applyButtonColour()
  }

  showEditor_() {
    const block = /** @type {BlockSvg | null} */ (this.getSourceBlock())
    const workspace = /** @type {WorkspaceSvg | null} */ (block?.workspace)
    if (!block || !workspace || workspace.isFlyout || workspace.options.readOnly) return
    toggleDrawer(workspace, block, this, this.mode_, this.renderHtml_)
  }

  dispose() {
    if (anchor?.field === this) closeDrawer()
    super.dispose()
  }
}

class FieldMatrixPreview extends FieldDrawerButton {
  getButtonColour() {
    return this.getSourceBlock()?.type === 'transform_pipeline'
      ? PIPELINE_TOGGLE_COLOUR
      : TRANSFORM_STEP_TOGGLE_COLOUR
  }
}

class FieldVectorPreview extends FieldDrawerButton {
  getButtonColour() {
    return VECTOR_TOGGLE_COLOUR
  }
}

function getBlock() {
  if (!anchor) return null
  return /** @type {BlockSvg | null} */ (anchor.workspace.getBlockById(anchor.blockId))
}

function setButtonHighlights(block) {
  if (!block) return
  for (const name of DRAWER_BUTTON_FIELD_NAMES) {
    const f = block.getField(name)
    if (f instanceof FieldDrawerButton) f.setActive(false)
  }
  if (!anchor || anchor.blockId !== block.id) return
  if (anchor.field instanceof FieldDrawerButton) anchor.field.setActive(true)
}

function ensureShell() {
  if (shell?.isConnected) return
  shell?.remove()
  shell = document.createElement('div')
  shell.className = 'matrix-drawer-shell'
  inner = document.createElement('div')
  inner.className = 'matrix-drawer-inner'
  const panel = document.createElement('div')
  panel.className = 'matrix-drawer-panel'
  panel.appendChild(inner)
  shell.appendChild(panel)
  document.body.appendChild(shell)
}

function refreshContent() {
  if (!inner || !anchor) return
  const block = getBlock()
  if (!block) {
    closeDrawer()
    return
  }
  inner.innerHTML = anchor.renderHtml(block)
}

/** @param {MatrixPreviewMode} mode @param {ComputeMatrixFn} computeMatrix @returns {RenderHtmlFn} */
function matrixRenderHtml(mode, computeMatrix) {
  const title = mode === '3x3' ? '3x3 matrix' : '4x4 homogeneous matrix'
  return (block) => `
    <div class="matrix-drawer-title">${title}</div>
    <div class="matrix-drawer-table-wrap">${formatMatrixHtml(computeMatrix(block))}</div>
  `
}

function fitContent() {
  if (!inner || !shell) return
  inner.style.transform = ''
  inner.style.width = ''
  const overflow = inner.scrollHeight - shell.clientHeight
  if (overflow <= 0) return
  const scale = Math.max(0.5, (shell.clientHeight - 4) / inner.scrollHeight)
  inner.style.transform = `scale(${scale})`
  inner.style.transformOrigin = 'left center'
  inner.style.width = `${100 / scale}%`
}

function getSingleBlockHeight(block) {
  const rect = block.getSvgRoot()?.getBoundingClientRect()
  if (!rect) return Math.max(64, block.getHeightWidth().height)

  const next = block.getNextBlock?.()
  if (next?.getSvgRoot) {
    const nextRect = next.getSvgRoot()?.getBoundingClientRect()
    if (nextRect && Number.isFinite(nextRect.top) && Number.isFinite(rect.top)) {
      const dy = nextRect.top - rect.top
      if (dy > 16) return dy
    }
  }

  if (rect.height && Number.isFinite(rect.height)) return rect.height
  return Math.max(64, block.getHeightWidth().height)
}

function syncLayout() {
  if (!shell || !anchor) return
  const block = getBlock()
  if (!block?.getSvgRoot()) {
    closeDrawer()
    return
  }
  // Left/top/bottom come from the block group's rect (the true visual edge --
  // the block's own <path> bbox sits inset from it by the output-tab width, and
  // that inset was the gap on the drawer's left). Width comes from the path
  // bbox so a pipeline's connected step blocks don't stretch the drawer.
  const groupRect = block.getSvgRoot().getBoundingClientRect()
  const svgPath = block.pathObject?.svgPath
  const pathRect = svgPath?.getBoundingClientRect()
  // A value block's outline starts at "m <TAB_WIDTH>,0" -- local x=0 is the
  // output tab's tip, x=TAB_WIDTH is the body's left edge. Anchoring to the
  // bbox left put the drawer out at the tab tip, overhanging the block by the
  // tab width times the workspace zoom.
  const tabMatch = /^\s*m\s+(-?[\d.]+)/i.exec(svgPath?.getAttribute('d') || '')
  const bodyInset = tabMatch ? parseFloat(tabMatch[1]) * (block.workspace?.scale || 1) : 0
  const rect = {
    left: groupRect.left + bodyInset,
    top: groupRect.top,
    right: groupRect.right,
    bottom: pathRect?.bottom || groupRect.bottom,
    width: (pathRect?.width || groupRect.width) - bodyInset,
  }
  // Both the pipeline and vector_arithmetic drop the drawer below the block,
  // spanning the block's own width; matrix primitives slide it out to the right.
  const isBelow = anchor.mode === 'vector' || block.type === 'transform_pipeline'

  shell.classList.toggle('matrix-drawer-shell--below', isBelow)

  // Clear any previous scaling before measuring intrinsic content size.
  if (inner) {
    inner.style.transform = ''
    inner.style.width = ''
  }

  shell.style.top = isBelow ? `${rect.bottom - 2}px` : `${rect.top}px`
  shell.style.left = isBelow ? `${rect.left}px` : `${rect.right}px`
  shell.style.width = isBelow ? `${rect.width}px` : ''
  shell.style.minWidth = ''
  shell.style.minHeight = ''
  shell.style.transform = ''
  shell.style.transformOrigin = 'top left'

  if (!isBelow) {
    shell.style.height = `${getSingleBlockHeight(block)}px`
    fitContent()
    return
  }

  // The drawer is exactly the block's width, always. If the expression doesn't
  // fit that width it is scaled down to fit -- the drawer never grows past the
  // block and never spills content past its own edge. PANEL_CHROME is the
  // panel's own padding + border.
  const PANEL_CHROME = 20
  const availWidth = Math.max(1, rect.width - PANEL_CHROME)
  const needWidth = inner ? inner.scrollWidth : 0
  const scale = needWidth > availWidth ? Math.max(0.4, availWidth / needWidth) : 1
  const needHeight = inner ? inner.scrollHeight : 0
  shell.style.height = `${Math.max(40, needHeight * scale + 10)}px`
  if (scale < 1 && inner) {
    inner.style.transformOrigin = 'top left'
    inner.style.transform = `scale(${scale})`
    inner.style.width = `${100 / scale}%`
  }
}

function stopTracking() {
  cancelAnimationFrame(trackRafId)
  trackRafId = 0
}

function startTracking() {
  stopTracking()
  const tick = () => {
    if (!anchor || !shell?.classList.contains('open')) {
      trackRafId = 0
      return
    }
    syncLayout()
    trackRafId = requestAnimationFrame(tick)
  }
  trackRafId = requestAnimationFrame(tick)
}

function unbindListeners() {
  if (anchor?.workspace && workspaceListener) {
    anchor.workspace.removeChangeListener(workspaceListener)
  }
  workspaceListener = null
  if (outsidePointerListener) {
    document.removeEventListener('pointerdown', outsidePointerListener, true)
  }
  outsidePointerListener = null
}

function bindListeners() {
  if (!anchor) return
  workspaceListener = (event) => {
    if (!anchor) return
    const anchorBlock = getBlock()
    // Anchors whose drawer contents depend on descendant blocks (nested steps,
    // plugged-in operands): refresh on any move/field change, not just the
    // anchor block's own.
    const isPipelineAnchor = anchorBlock?.type === 'transform_pipeline' || anchor.mode === 'vector'
    if (event.type === Blockly.Events.BLOCK_DELETE && event.blockId === anchor.blockId) {
      closeDrawer()
      return
    }
    if (event.type === Blockly.Events.VIEWPORT_CHANGE) {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        syncLayout()
      })
      return
    }
    if (event.type === Blockly.Events.BLOCK_MOVE && event.blockId === anchor.blockId) {
      syncLayout()
      return
    }
    if (
      isPipelineAnchor &&
      event.type === Blockly.Events.BLOCK_MOVE &&
      blockMoveChangesGeneratedCode(event)
    ) {
      refreshContent()
      syncLayout()
      return
    }
    if (
      event.type === Blockly.Events.BLOCK_CHANGE &&
      event.blockId === anchor.blockId &&
      event.element === 'field'
    ) {
      refreshContent()
      syncLayout()
      return
    }
    if (
      isPipelineAnchor &&
      event.type === Blockly.Events.BLOCK_CHANGE &&
      event.element === 'field'
    ) {
      refreshContent()
      syncLayout()
    }
  }
  anchor.workspace.addChangeListener(workspaceListener)

  requestAnimationFrame(() => {
    if (!anchor) return
    outsidePointerListener = (e) => {
      if (!anchor || !shell) return
      const t = /** @type {Node} */ (e.target)
      if (shell.contains(t)) return
      if (anchor.field.fieldGroup_?.contains(t)) return
      const ws = anchor.workspace
      for (const b of ws.getAllBlocks(false)) {
        const svg = b.getSvgRoot()
        if (svg?.contains(t)) return
      }
      closeDrawer()
    }
    document.addEventListener('pointerdown', outsidePointerListener, true)
  })
  startTracking()
}

function closeDrawer() {
  stopTracking()
  shell?.classList.remove('open')
  unbindListeners()
  setButtonHighlights(getBlock())
  anchor = null
}

function openDrawer(workspace, block, field, mode, renderHtml) {
  ensureShell()
  anchor = { workspace, blockId: block.id, field, mode, renderHtml }
  refreshContent()
  syncLayout()
  shell.classList.add('open')
  setButtonHighlights(block)
  unbindListeners()
  bindListeners()
  requestAnimationFrame(syncLayout)
}

function toggleDrawer(workspace, block, field, mode, renderHtml) {
  if (anchor?.field === field && shell?.classList.contains('open')) {
    closeDrawer()
    return
  }
  if (anchor?.blockId === block.id && shell?.classList.contains('open')) {
    anchor.field = field
    anchor.mode = mode
    anchor.renderHtml = renderHtml
    refreshContent()
    syncLayout()
    setButtonHighlights(block)
    return
  }
  if (shell?.classList.contains('open')) closeDrawer()
  openDrawer(workspace, block, field, mode, renderHtml)
}

/**
 * Spacer + 3x3 / 4x4 preview buttons on transform blocks.
 * @param {Block} block
 * @param {ComputeMatrixFn} mat3
 * @param {ComputeMatrixFn} mat4
 */
export function appendMatrixPreviewUI(block, mat3, mat4, options = {}) {
  const spacerHeight = options.spacerHeight ?? 8
  if (spacerHeight > 0) {
    block
      .appendDummyInput('MATRIX_MIN_SPACER')
      .appendField(new FieldMatrixSpacer(spacerHeight), 'MIN_SPACER')
  }
  block
    .appendDummyInput('MATRIX_PREVIEW')
    .setAlign(Blockly.inputs.Align.RIGHT)
    .appendField(new FieldMatrixPreview('3x3', '3x3', matrixRenderHtml('3x3', mat3)), 'MATRIX_3X3')
    .appendField(new FieldMatrixPreview('4x4', '4x4', matrixRenderHtml('4x4', mat4)), 'MATRIX_4X4')
}

/**
 * A single preview button that opens the shared drawer with arbitrary HTML.
 * Used by vector_arithmetic to show its operands and result.
 * @param {Block} block
 * @param {RenderHtmlFn} renderHtml
 */
export function appendVectorPreviewUI(block, renderHtml, options = {}) {
  const spacerHeight = options.spacerHeight ?? 0
  // Force the button onto its own row below the (inline) operand inputs so the
  // block doesn't grow wide.
  if (block.appendEndRowInput) block.appendEndRowInput('VECTOR_PREVIEW_BREAK')
  if (spacerHeight > 0) {
    block
      .appendDummyInput('MATRIX_MIN_SPACER')
      .appendField(new FieldMatrixSpacer(spacerHeight), 'MIN_SPACER')
  }
  block
    .appendDummyInput('VECTOR_PREVIEW_ROW')
    .setAlign(Blockly.inputs.Align.RIGHT)
    .appendField(new FieldVectorPreview('show', 'vector', renderHtml), 'VECTOR_PREVIEW')
}
