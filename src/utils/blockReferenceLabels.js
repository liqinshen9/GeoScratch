import * as Blockly from 'blockly/core'
import * as namingRegistry from './namingRegistry'
import { REF_BLOCK_TYPE, referenceDisplayName } from './variableReference'

// "Collapse to reference" -- lets a block shrink to a small labeled puck.
// Naming itself is delegated entirely to namingRegistry.js: a block that's
// already nameable (geo_vector/geo_sphere/parametric_plane/... -- see
// NAMEABLE_KIND_CONFIG) already has a real name the moment it's created, so
// collapsing it just needs to display that name; a plain compute-result
// operand (vector_arithmetic, scalar_arithmetic, ...) being collapsed as a
// nested input has no name of its own, so it's given one from a pooled
// single-letter scheme (a-z, then r1, r2, ...) the first time it's
// collapsed. Both kinds of name live in the exact same namingRegistry
// storage, so they can never collide and are shown identically everywhere
// (block face, 3D label, collapsed bubble).
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

let INSTALLED = false

function usedNames(workspace) {
  return new Set(
    workspace
      .getAllBlocks(false)
      .map((block) => namingRegistry.getDisplayName(block))
      .filter(Boolean),
  )
}

function nextPooledAlias(workspace) {
  const used = usedNames(workspace)
  const pooled = ALIAS_POOL.find((alias) => !used.has(alias))
  if (pooled) return pooled

  for (let index = 1; index < 1000; index += 1) {
    const alias = `r${index}`
    if (!used.has(alias)) return alias
  }
  return 'r'
}

// Blockly bakes toString() into a FieldLabel once, when the block is
// collapsed -- so a later rename leaves the old name on the collapsed puck.
// Re-push it. (Pre-existing bug for any collapsed object, not just variable
// references: renameNameable below only re-rendered.)
export function refreshCollapsedLabel(block) {
  if (!block?.isCollapsed?.()) return
  block.getField(Blockly.Block.COLLAPSED_FIELD_NAME)?.setValue(block.toString())
}

function refresh(block) {
  refreshCollapsedLabel(block)
  block.render?.()
  block.workspace?.resizeContents?.()
}

function collapseWithAlias(block) {
  if (!namingRegistry.getDisplayName(block)) {
    namingRegistry.setCustomName(block, nextPooledAlias(block.workspace))
  }
  block.setCollapsed(true)
  refresh(block)
}

function expandReference(block) {
  block.setCollapsed(false)
  refresh(block)
}

function renamePooledOperand(block) {
  const current = namingRegistry.getDisplayName(block) || nextPooledAlias(block.workspace)
  const next = window.prompt('Reference name', current)
  if (next == null) return

  const trimmed = next.trim()
  if (!trimmed) return

  namingRegistry.setCustomName(block, trimmed)
  if (block.isCollapsed()) refresh(block)
}

function renameNameable(block) {
  const current = namingRegistry.getDisplayName(block)
  const next = window.prompt('Name', current)
  if (next == null) return

  const trimmed = next.trim()
  if (!trimmed) {
    namingRegistry.clearCustomName(block)
  } else {
    namingRegistry.setCustomName(block, trimmed)
  }
  refresh(block)
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
    (namingRegistry.isNameable(block) ||
      namingRegistry.getDisplayName(block) ||
      // A variable reference has no naming record of its own (it displays the
      // wrapper's name), but is spawned collapsed -- without this it could be
      // expanded and then never collapsed again.
      block.type === 'geo_variable_ref'),
  )
}

function canExpandReference(block) {
  return Boolean(block?.outputConnection && !block.isInFlyout)
}

function registerMenuItem(id, item) {
  const registry = Blockly.ContextMenuRegistry.registry
  if (registry.getItem(id)) registry.unregister(id)
  registry.register({ id, scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK, ...item })
}

export function installBlockReferenceLabels() {
  if (INSTALLED) return
  INSTALLED = true

  const originalToString = Blockly.Block.prototype.toString
  Blockly.Block.prototype.toString = function patchedReferenceToString(...args) {
    if (this.isCollapsed?.()) {
      // A variable reference has no naming record of its own -- it shows the
      // name of the wrapper it points at. Resolving it here (rather than
      // falling through) matters because Blockly's default toString on a
      // collapsed block renders the collapsed label itself, so refreshing
      // that label from toString() would just rewrite the stale text.
      if (this.type === REF_BLOCK_TYPE) return referenceDisplayName(this)
      const name = namingRegistry.getDisplayName(this)
      if (name) return name
    }
    return originalToString.apply(this, args)
  }

  registerMenuItem('geoScratchCollapseToReference', {
    weight: 6,
    displayText: (scope) => {
      const name = namingRegistry.getDisplayName(scope.block)
      return name ? `Collapse to reference (${name})` : 'Collapse to reference'
    },
    preconditionFn: (scope) =>
      (canCollapseInput(scope.block) || canCollapseWholeBlock(scope.block)) &&
      !scope.block.isCollapsed()
        ? 'enabled'
        : 'hidden',
    callback: (scope) => collapseWithAlias(scope.block),
  })

  registerMenuItem('geoScratchExpandReference', {
    weight: 7,
    displayText: (scope) =>
      `Expand reference (${namingRegistry.getDisplayName(scope.block) || 'unnamed'})`,
    preconditionFn: (scope) =>
      canExpandReference(scope.block) && scope.block.isCollapsed() ? 'enabled' : 'hidden',
    callback: (scope) => expandReference(scope.block),
  })

  // Scoped to compute-result operands only -- whole nameable objects (Line,
  // Sphere, Plane, ...) use the broader "Rename" item below instead, so the
  // two don't both show up on the same block.
  registerMenuItem('geoScratchRenameReference', {
    weight: 8,
    displayText: (scope) =>
      namingRegistry.getDisplayName(scope.block) ? 'Rename reference' : 'Name reference',
    preconditionFn: (scope) => (canCollapseInput(scope.block) ? 'enabled' : 'hidden'),
    callback: (scope) => renamePooledOperand(scope.block),
  })

  registerMenuItem('geoScratchRename', {
    weight: 8,
    displayText: () => 'Rename',
    preconditionFn: (scope) => (namingRegistry.isNameable(scope.block) ? 'enabled' : 'hidden'),
    callback: (scope) => renameNameable(scope.block),
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
