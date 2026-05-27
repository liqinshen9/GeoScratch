import * as Blockly from 'blockly/core'
import { Field } from 'blockly/core'
import { formatMatrixHtml } from './homogeneousMatrix.js'

/** @typedef {import('blockly/core').BlockSvg} BlockSvg */
/** @typedef {import('blockly/core').WorkspaceSvg} WorkspaceSvg */
/** @typedef {import('blockly/core').Block} Block */
/** @typedef {'3x3' | '4x4'} MatrixPreviewMode */
/** @typedef {(block: Block) => number[][]} ComputeMatrixFn */

const MIN_HEIGHT_4X4 = 128
const MIN_HEIGHT_3X3 = 96
const MATRIX_FIELD_NAMES = ['MATRIX_3X3', 'MATRIX_4X4']

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
    if (!this.borderRect_) return
    this.borderRect_.setAttribute('fill', open ? '#bfdbfe' : '#e2e8f0')
    this.borderRect_.setAttribute('stroke', open ? '#2563eb' : '#334155')
  }

  initView() {
    super.initView()
    if (this.borderRect_) {
      this.borderRect_.setAttribute('fill', '#e2e8f0')
      this.borderRect_.setAttribute('stroke', '#334155')
      this.borderRect_.setAttribute('stroke-width', '1.5')
    }
    if (this.textElement_) {
      this.textElement_.setAttribute('font-size', '11px')
      this.textElement_.setAttribute('font-weight', '700')
      this.textElement_.setAttribute('fill', '#0f172a')
    }
  }

  applyColour() {
    super.applyColour()
    if (this.textElement_) this.textElement_.setAttribute('fill', '#0f172a')
    if (!this.isOpen_ && this.borderRect_) {
      this.borderRect_.setAttribute('fill', '#e2e8f0')
      this.borderRect_.setAttribute('stroke', '#334155')
    }
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
  const title = anchor.mode === '3x3' ? '3×3 matrix' : '4×4 homogeneous matrix'
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
  const scale = Math.max(0.72, (shell.clientHeight - 4) / inner.scrollHeight)
  inner.style.transform = `scale(${scale})`
  inner.style.transformOrigin = 'left center'
  inner.style.width = `${100 / scale}%`
}

function syncLayout() {
  if (!shell || !anchor) return
  const block = getBlock()
  if (!block?.getSvgRoot()) {
    closeDrawer()
    return
  }
  const scale = anchor.workspace.scale
  const rect = block.getSvgRoot().getBoundingClientRect()
  const minH = anchor.mode === '3x3' ? MIN_HEIGHT_3X3 : MIN_HEIGHT_4X4
  const h = Math.max(block.getHeightWidth().height, minH)

  shell.style.top = `${rect.top}px`
  shell.style.left = `${rect.right}px`
  shell.style.height = `${h}px`
  shell.style.minHeight = `${minH}px`
  shell.style.transform = `scale(${scale})`
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
      event.type === Blockly.Events.BLOCK_CHANGE &&
      event.blockId === anchor.blockId &&
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
 * Spacer + 3×3 / 4×4 preview buttons on transform blocks.
 * @param {Block} block
 * @param {ComputeMatrixFn} mat3
 * @param {ComputeMatrixFn} mat4
 */
export function appendMatrixPreviewUI(block, mat3, mat4) {
  block
    .appendDummyInput('MATRIX_MIN_SPACER')
    .appendField(new FieldMatrixSpacer(32), 'MIN_SPACER')
  block
    .appendDummyInput('MATRIX_PREVIEW')
    .setAlign(Blockly.inputs.Align.RIGHT)
    .appendField(new FieldMatrixPreview('3×3', '3x3', mat3), 'MATRIX_3X3')
    .appendField(new FieldMatrixPreview('4×4', '4x4', mat4), 'MATRIX_4X4')
}
