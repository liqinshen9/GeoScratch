import * as Blockly from 'blockly/core'
import { Field } from 'blockly/core'
import { formatMatrixHtml } from './homogeneousMatrix.js'

/** @typedef {import('blockly/core').BlockSvg} BlockSvg */
/** @typedef {import('blockly/core').WorkspaceSvg} WorkspaceSvg */
/** @typedef {import('blockly/core').Block} Block */
/** @typedef {'3x3' | '4x4'} MatrixPreviewMode */
/** @typedef {(block: Block) => number[][]} ComputeMatrixFn */

const MATRIX_FIELD_NAMES = ['MATRIX_3X3', 'MATRIX_4X4']
const PIPELINE_TOGGLE_COLOUR = '#5dd979'
const TRANSFORM_STEP_TOGGLE_COLOUR = '#ff914d'
const TOGGLE_TEXT_COLOUR = '#111827'

/** @type {HTMLDivElement | null} */
let shell = null
/** @type {HTMLDivElement | null} */
let inner = null

/** @type {{
 *   workspace: WorkspaceSvg
 *   blockId: string
 *   field: Field
 *   mode: MatrixPreviewMode
 *   computeMatrix: ComputeMatrixFn
 * } | null} */
let anchor = null

/** @type {((e: Blockly.Events.Abstract) => void) | null} */
let workspaceListener = null
/** @type {((e: PointerEvent) => void) | null} */
let outsidePointerListener = null
let rafId = 0
let trackRafId = 0

class FieldMatrixSpacer extends Field {
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

class FieldMatrixPreview extends Field {
  /** @type {MatrixPreviewMode} */
  mode_
  /** @type {ComputeMatrixFn} */
  computeMatrix_
  /** @type {boolean} */
  isOpen_ = false

  EDITABLE = false
  SERIALIZABLE = false

  /** @param {string} label @param {MatrixPreviewMode} mode @param {ComputeMatrixFn} computeMatrix */
  constructor(label, mode, computeMatrix) {
    super(label, null)
    this.mode_ = mode
    this.computeMatrix_ = computeMatrix
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
    const block = this.getSourceBlock()
    return block?.type === 'transform_pipeline' ? PIPELINE_TOGGLE_COLOUR : TRANSFORM_STEP_TOGGLE_COLOUR
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
    toggleDrawer(workspace, block, this, this.mode_, this.computeMatrix_)
  }

  dispose() {
    if (anchor?.field === this) closeDrawer()
    super.dispose()
  }
}

function getBlock() {
  if (!anchor) return null
  return /** @type {BlockSvg | null} */ (anchor.workspace.getBlockById(anchor.blockId))
}

function setButtonHighlights(block) {
  if (!block) return
  for (const name of MATRIX_FIELD_NAMES) {
    const f = block.getField(name)
    if (f instanceof FieldMatrixPreview) f.setActive(false)
  }
  if (!anchor || anchor.blockId !== block.id) return
  const active = block.getField(anchor.mode === '3x3' ? 'MATRIX_3X3' : 'MATRIX_4X4')
  if (active instanceof FieldMatrixPreview) active.setActive(true)
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
  const title = anchor.mode === '3x3' ? '3x3 matrix' : '4x4 homogeneous matrix'
  inner.innerHTML = `
    <div class="matrix-drawer-title">${title}</div>
    <div class="matrix-drawer-table-wrap">${formatMatrixHtml(anchor.computeMatrix(block))}</div>
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
  const rect = block.getSvgRoot().getBoundingClientRect()
  const isPipeline = block.type === 'transform_pipeline'
  const h = isPipeline ? 132 : getSingleBlockHeight(block)

  shell.classList.toggle('matrix-drawer-shell--below', isPipeline)

  shell.style.top = isPipeline ? `${rect.bottom - 2}px` : `${rect.top}px`
  shell.style.left = isPipeline ? `${rect.left}px` : `${rect.right}px`
  shell.style.width = isPipeline ? `${rect.width}px` : ''
  shell.style.height = `${h}px`
  shell.style.minHeight = ''
  shell.style.transform = ''
  shell.style.transformOrigin = 'top left'
  fitContent()
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
    const isPipelineAnchor = anchorBlock?.type === 'transform_pipeline'
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
    if (isPipelineAnchor && event.type === Blockly.Events.BLOCK_MOVE) {
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
    if (isPipelineAnchor && event.type === Blockly.Events.BLOCK_CHANGE && event.element === 'field') {
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

function openDrawer(workspace, block, field, mode, computeMatrix) {
  ensureShell()
  anchor = { workspace, blockId: block.id, field, mode, computeMatrix }
  refreshContent()
  syncLayout()
  shell.classList.add('open')
  setButtonHighlights(block)
  unbindListeners()
  bindListeners()
  requestAnimationFrame(syncLayout)
}

function toggleDrawer(workspace, block, field, mode, computeMatrix) {
  if (anchor?.field === field && shell?.classList.contains('open')) {
    closeDrawer()
    return
  }
  if (anchor?.blockId === block.id && shell?.classList.contains('open')) {
    anchor.field = field
    anchor.mode = mode
    anchor.computeMatrix = computeMatrix
    refreshContent()
    syncLayout()
    setButtonHighlights(block)
    return
  }
  if (shell?.classList.contains('open')) closeDrawer()
  openDrawer(workspace, block, field, mode, computeMatrix)
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
    .appendField(new FieldMatrixPreview('3x3', '3x3', mat3), 'MATRIX_3X3')
    .appendField(new FieldMatrixPreview('4x4', '4x4', mat4), 'MATRIX_4X4')
}
