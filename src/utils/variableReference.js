import {
  readBlockData,
  writeBlockData,
  findBlockByRefId,
  getDisplayName,
} from '@/utils/namingRegistry'

export const REF_BLOCK_TYPE = 'geo_variable_ref'
export const WRAPPER_BLOCK_TYPE = 'geo_variable'

// Which wrapper a `geo_variable_ref` block points at, persisted in its own
// namespace on block.data (alongside, never clobbering, the naming record).
// Lives here rather than in variableWrapper.js so lightweight utilities --
// validateVariableOrdering.js in particular -- can read it without pulling in
// the whole block-definition/colour-system import chain.
//
// Pairing is by the wrapper's naming refId, not its block id: refId survives
// addCompositeBlockToWorkspace (which strips ids), and a duplicated wrapper
// gets a fresh one, so a copy can never hijack the original's references.
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
  // Only "(missing)" when it actually pointed somewhere once -- a fresh
  // reference (the palette preview, or one dragged out before being wired)
  // has never had a target and shouldn't read as broken.
  if (!target?.targetRefId) return 'Variable reference'
  return `${target.lastKnownName || 'Variable'} (missing)`
}

// ---------------------------------------------------------------------
// Code generation (kept here, away from the block definitions, so it stays
// unit-testable without pulling in the field/colour import chain).
// ---------------------------------------------------------------------

// geoSetVar stores AND returns the value, so the wrapped expression is
// evaluated exactly once -- splicing it in twice would construct two separate
// objects (the lesson already learned in setObj3D.js).
export function wrapperCode(refId, innerCode) {
  return `geoSetVar(${JSON.stringify(refId)}, ${innerCode})`
}

export function referenceCode(targetRefId, fallbackExpression) {
  return `geoVar(${JSON.stringify(targetRefId)}, ${fallbackExpression})`
}

// A dangling or mis-ordered reference must not hand `undefined` to a consumer
// -- e.g. linalg_vec3's "from point:" does `__anchor.clone()`, which would
// throw and (via generateAndRun's catch) blank the ENTIRE scene. Pick the
// fallback from what the wrapper actually holds where that's knowable, else
// from the socket this reference is plugged into.
export function fallbackExpressionFor(block) {
  const targetBlock = resolveRefTargetBlock(block)
  const wrappedCheck = targetBlock?.getInputTargetBlock?.('VALUE')?.outputConnection?.getCheck?.()
  const parentCheck = block?.outputConnection?.targetConnection?.getCheck?.()
  const candidates = [wrappedCheck, parentCheck].flat().filter(Boolean)

  if (candidates.includes('scalar') && !candidates.includes('vector3')) return '0'
  if (candidates.includes('vector3')) return 'new THREE.Vector3()'
  return 'null'
}
