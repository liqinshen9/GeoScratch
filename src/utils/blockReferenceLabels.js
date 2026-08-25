import * as Blockly from 'blockly/core'

const DATA_KEY = 'geoScratchReferenceAlias'
const AUTO_DATA_KEY = 'geoScratchReferenceAliasAuto'
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

let INSTALLED = false
let originalToString = null

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

function isAutoAlias(block) {
  return parseData(block)[AUTO_DATA_KEY] === true
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

function nextAlias(workspace) {
  const used = new Set(
    workspace
      .getAllBlocks(false)
      .filter((block) => block.isCollapsed?.())
      .map(getAlias)
      .filter(Boolean)
  )

  const pooled = ALIAS_POOL.find((alias) => !used.has(alias))
  if (pooled) return pooled

  for (let index = 1; index < 1000; index += 1) {
    const alias = `r${index}`
    if (!used.has(alias)) return alias
  }

  return 'r'
}

function refresh(block) {
  block.render?.()
  block.workspace?.resizeContents?.()
}

function collapseWithAlias(block) {
  if (!getAlias(block)) setAlias(block, nextAlias(block.workspace), { auto: true })
  block.setCollapsed(true)
  refresh(block)
}

function expandReference(block) {
  block.setCollapsed(false)
  if (isAutoAlias(block)) setAlias(block, '')
  refresh(block)
}

function renameReference(block) {
  const current = getAlias(block) || nextAlias(block.workspace)
  const next = window.prompt('Reference name', current)
  if (next == null) return

  const trimmed = next.trim()
  if (!trimmed) return

  setAlias(block, trimmed, { auto: false })
  if (block.isCollapsed()) refresh(block)
}

function canCollapseInput(block) {
  if (!block?.outputConnection?.targetConnection || block.isInFlyout) return false

  const parent = block.getParent?.()
  if (!parent) return false

  // Collapse whole inputs on compute blocks, even when the compute block is
  // nested inside a larger expression. Creation blocks keep their defining
  // point/vector/plane details visible.
  return COLLAPSIBLE_INPUT_PARENT_TYPES.has(parent.type)
}

function canExpandReference(block) {
  return Boolean(block?.outputConnection && !block.isInFlyout && getAlias(block))
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

  registerMenuItem('geoScratchCollapseToReference', {
    weight: 6,
    displayText: (scope) => {
      const alias = getAlias(scope.block)
      return alias ? `Collapse to reference (${alias})` : 'Collapse to reference'
    },
    preconditionFn: (scope) => (
      canCollapseInput(scope.block) && !scope.block.isCollapsed() ? 'enabled' : 'hidden'
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
    preconditionFn: (scope) => (canCollapseInput(scope.block) ? 'enabled' : 'hidden'),
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
