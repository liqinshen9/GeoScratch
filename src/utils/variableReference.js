import {
  readBlockData,
  writeBlockData,
  findBlockByRefId,
  getDisplayName,
} from '@/utils/namingRegistry'

export const REF_BLOCK_TYPE = 'geo_variable_ref'
export const WRAPPER_BLOCK_TYPE = 'geo_variable'

// Which wrapper a geo_variable_ref points at, in its own block.data namespace.
// Kept out of variableWrapper.js so lightweight utils can read it.
// See docs/architecture/naming-registry.md#variable-references-variablereferencejs.
export const REF_DATA_NAMESPACE = 'geoScratchVarRef'

export function getRefTarget(block) {
  return readBlockData(block, REF_DATA_NAMESPACE)
}

export function setRefTarget(block, targetRefId, lastKnownName) {
  writeBlockData(block, REF_DATA_NAMESPACE, { targetRefId, lastKnownName })
}

export function resolveRefTargetBlock(block) {
  const targetRefId = getRefTarget(block)?.targetRefId
  return targetRefId ? findBlockByRefId(block.workspace, targetRefId) : null
}

/** What a reference block should display: its wrapper's live name. */
export function referenceDisplayName(block) {
  const targetBlock = resolveRefTargetBlock(block)
  if (targetBlock) return getDisplayName(targetBlock) || 'Variable'
  const target = getRefTarget(block)
  // "(missing)" only when it once pointed somewhere.
  // See docs/architecture/naming-registry.md#missing-only-when-once-pointed.
  if (!target?.targetRefId) return 'Variable reference'
  return `${target.lastKnownName || 'Variable'} (missing)`
}

// Code generation, kept out of the block definitions to stay unit-testable.

// geoSetVar stores AND returns, so the expression is evaluated once.
// See docs/architecture/naming-registry.md#wrapper-code-evaluates-once.
export function wrapperCode(refId, innerCode) {
  return `geoSetVar(${JSON.stringify(refId)}, ${innerCode})`
}

export function referenceCode(targetRefId, fallbackExpression) {
  return `geoVar(${JSON.stringify(targetRefId)}, ${fallbackExpression})`
}

// Type-appropriate fallback so a dangling reference can't blank the scene.
// See docs/architecture/naming-registry.md#reference-fallback.
export function fallbackExpressionFor(block) {
  const targetBlock = resolveRefTargetBlock(block)
  const wrappedCheck = targetBlock?.getInputTargetBlock?.('VALUE')?.outputConnection?.getCheck?.()
  const parentCheck = block?.outputConnection?.targetConnection?.getCheck?.()
  const candidates = [wrappedCheck, parentCheck].flat().filter(Boolean)

  if (candidates.includes('scalar') && !candidates.includes('vector3')) return '0'
  if (candidates.includes('vector3')) return 'new THREE.Vector3()'
  return 'null'
}
