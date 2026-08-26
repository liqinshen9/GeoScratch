import * as Blockly from 'blockly/core'

const DATA_KEY = 'geoScratchReferenceAlias'
const AUTO_DATA_KEY = 'geoScratchReferenceAliasAuto'
const REF_ID_KEY = 'geoScratchReferenceId'
const ALIAS_POOL = 'abcdefghijklmnopqrstuvwxyz'.split('')
const COLLAPSIBLE_INPUT_PARENT_TYPES = new Set([
  'vector_arithmetic',
  'vector_project',
  'vector_cross_product',
  'vector_dot_product',
  'vector_normalise',
  'vector_magnitude',
  'scalar_arithmetic',
])
const COLLAPSIBLE_CREATION_PARENT_INPUTS = Object.freeze({
  geo_vector: new Set(['POS', 'DIR']),
})
const COLLAPSIBLE_WHOLE_BLOCK_TYPES = new Set([
  'geo_vector',
  'parametric_plane',
])

let INSTALLED = false
let originalToString = null
let originalSetCollapsed = null

function parseData(block) {
  if (!block?.data) return {}
  try {
    const parsed = JSON.parse(block.data)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeData(block, nextData) {
  block.data = Object.keys(nextData).length ? JSON.stringify(nextData) : null
}

function getAlias(block) {
  const alias = parseData(block)[DATA_KEY]
  return typeof alias === 'string' ? alias.trim() : ''
}

function getReferenceId(block) {
  const refId = parseData(block)[REF_ID_KEY]
  return typeof refId === 'string' ? refId.trim() : ''
}

function getCollapsedFieldAlias(block) {
  const text = block?.getField?.(Blockly.Block.COLLAPSED_FIELD_NAME)?.getText?.()
  return typeof text === 'string' ? text.trim() : ''
}

function setAlias(block, alias, { auto = false } = {}) {
  const trimmed = String(alias || '').trim()
  const data = parseData(block)
  if (trimmed) {
    data[DATA_KEY] = trimmed
    data[AUTO_DATA_KEY] = auto
  } else {
    delete data[DATA_KEY]
    delete data[AUTO_DATA_KEY]
  }
  writeData(block, data)
}

function ensureReferenceId(block) {
  const existing = getReferenceId(block)
  if (existing) return existing

  const data = parseData(block)
  const refId = `ref-${Blockly.utils.idGenerator.genUid()}`
  data[REF_ID_KEY] = refId
  writeData(block, data)
  return refId
}

function usedAliases(workspace) {
  return new Set(
    workspace
      .getAllBlocks(false)
      .map(getAlias)
      .filter(Boolean)
  )
}

function nextNumberedAlias(used, prefix) {
  for (let index = 1; index < 1000; index += 1) {
    const alias = `${prefix}${index}`
    if (!used.has(alias)) return alias
  }

  return prefix
}

function nextAlias(workspace, block = null) {
  const used = usedAliases(workspace)

  if (block?.type === 'geo_vector') return nextNumberedAlias(used, 'L')
  if (block?.type === 'parametric_plane') return nextNumberedAlias(used, 'Plane')

  const pooled = ALIAS_POOL.find((alias) => !used.has(alias))
  if (pooled) return pooled

  return nextNumberedAlias(used, 'r')
}

function nextAliasForBlock(block) {
  return nextAlias(block.workspace, block)
}

function preserveDurableAliasBeforeExpand(block) {
  const alias = getAlias(block) || getCollapsedFieldAlias(block)
  if (!alias) return

  if (!getAlias(block)) setAlias(block, alias, { auto: true })
  ensureReferenceId(block)
}

function refresh(block) {
  block.render?.()
  block.workspace?.resizeContents?.()
}

function collapseWithAlias(block) {
  const alias = getAlias(block) || nextAliasForBlock(block)
  setAlias(block, alias, { auto: true })
  ensureReferenceId(block)
  block.setCollapsed(true)
  refresh(block)
}

function expandReference(block) {
  block.setCollapsed(false)
  refresh(block)
}

function renameReference(block) {
  const current = getAlias(block) || nextAliasForBlock(block)
  const next = window.prompt('Reference name', current)
  if (next == null) return

  const trimmed = next.trim()
  if (!trimmed) return

  setAlias(block, trimmed, { auto: false })
  ensureReferenceId(block)
  if (block.isCollapsed()) refresh(block)
}

function canCollapseInput(block) {
  if (!block?.outputConnection?.targetConnection || block.isInFlyout) return false

  const parent = block.getParent?.()
  if (!parent) return false

  // Compute blocks accept collapsed references as operands. Creation blocks only
  // expose selected nested inputs so the whole object can still collapse too.
  if (COLLAPSIBLE_INPUT_PARENT_TYPES.has(parent.type)) return true

  const parentInputName = block.outputConnection.targetConnection.getParentInput?.()?.name
  const collapsibleInputs = COLLAPSIBLE_CREATION_PARENT_INPUTS[parent.type]
  return Boolean(collapsibleInputs?.has(parentInputName))
}

function canCollapseWholeBlock(block) {
  return Boolean(
    block?.outputConnection &&
    !block.isInFlyout &&
    (COLLAPSIBLE_WHOLE_BLOCK_TYPES.has(block.type) || getAlias(block) || getCollapsedFieldAlias(block))
  )
}

function canExpandReference(block) {
  return Boolean(block?.outputConnection && !block.isInFlyout && (getAlias(block) || getCollapsedFieldAlias(block)))
}

function registerMenuItem(id, item) {
  const registry = Blockly.ContextMenuRegistry.registry
  if (registry.getItem(id)) registry.unregister(id)
  registry.register({ id, scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK, ...item })
}

export function installBlockReferenceLabels() {
  if (INSTALLED) return
  INSTALLED = true

  originalToString = Blockly.Block.prototype.toString
  Blockly.Block.prototype.toString = function patchedReferenceToString(...args) {
    const alias = this.isCollapsed?.() ? getAlias(this) : ''
    if (alias) return alias
    return originalToString.apply(this, args)
  }

  originalSetCollapsed = Blockly.BlockSvg.prototype.setCollapsed
  Blockly.BlockSvg.prototype.setCollapsed = function patchedReferenceSetCollapsed(collapsed) {
    if (!collapsed && this.isCollapsed?.()) preserveDurableAliasBeforeExpand(this)
    return originalSetCollapsed.call(this, collapsed)
  }

  registerMenuItem('geoScratchCollapseToReference', {
    weight: 6,
    displayText: (scope) => {
      const alias = getAlias(scope.block)
      return alias ? `Collapse to reference (${alias})` : 'Collapse to reference'
    },
    preconditionFn: (scope) => (
      (canCollapseInput(scope.block) || canCollapseWholeBlock(scope.block)) && !scope.block.isCollapsed()
        ? 'enabled'
        : 'hidden'
    ),
    callback: (scope) => collapseWithAlias(scope.block),
  })

  registerMenuItem('geoScratchExpandReference', {
    weight: 7,
    displayText: (scope) => `Expand reference (${getAlias(scope.block) || 'unnamed'})`,
    preconditionFn: (scope) => (
      canExpandReference(scope.block) && scope.block.isCollapsed() ? 'enabled' : 'hidden'
    ),
    callback: (scope) => expandReference(scope.block),
  })

  registerMenuItem('geoScratchRenameReference', {
    weight: 8,
    displayText: (scope) => (getAlias(scope.block) ? 'Rename reference' : 'Name reference'),
    preconditionFn: (scope) => (
      canCollapseInput(scope.block) || canCollapseWholeBlock(scope.block) ? 'enabled' : 'hidden'
    ),
    callback: (scope) => renameReference(scope.block),
  })
}

export function flattenCollapsedReferenceEdges(workspace) {
  const constants = workspace?.getRenderer?.().getConstants?.()
  if (!constants?.JAGGED_TEETH) return

  constants.JAGGED_TEETH.width = 0
  constants.JAGGED_TEETH.height = 0
  constants.JAGGED_TEETH.path = ''
  constants.JAGGED_TEETH_WIDTH = 0
  constants.JAGGED_TEETH_HEIGHT = 0

  if (constants.highlightConstants_?.JAGGED_TEETH) {
    constants.highlightConstants_.JAGGED_TEETH.width = 0
    constants.highlightConstants_.JAGGED_TEETH.height = 0
    constants.highlightConstants_.JAGGED_TEETH.path = ''
    constants.highlightConstants_.JAGGED_TEETH.pathLeft = ''
  }
}
