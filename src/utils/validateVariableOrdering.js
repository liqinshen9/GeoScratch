// Blockly's javascriptGenerator.workspaceToCode emits top-level stacks in
// workspace.getTopBlocks(true) order -- sorted by each stack's on-screen
// position (roughly top-to-bottom, left-to-right; see Workspace.sortObjects),
// not creation order. A `get` block whose stack sits above its `set` block's
// stack on the canvas is emitted first, and reads the variable before that
// `set` statement has run -- this repo's generators default the variable's
// declaration to `undefined` (via the JS generator's own auto-declaration,
// see setObj3D.js's comment) rather than throwing, so this silently reads a
// stale/empty value instead of crashing. Rather than leave that as a silent
// footgun, flag it as a visible warning on the offending `get` block -- same
// mechanism generateAndRun.js's runConnectedTransformPipelines already uses
// for its own warnings. Uses the identical getTopBlocks(true) ordering the
// real generator uses, so "stack index" here means the same thing it does
// during actual code generation.
//
// Granularity: per top-level stack (a "stack" = one top block plus
// everything reachable from it), not full statement-by-statement order --
// sufficient to catch the common "used it in an earlier stack" case; a
// get/set pair within the very same stack but in the wrong sub-order isn't
// distinguished. True reordering is out of scope (see the plan).

import { getRefId, getDisplayName } from '@/utils/namingRegistry'
import { getRefTarget } from '@/utils/variableReference'

const GET_TYPES = Object.freeze(['variables_get_obj3D', 'variables_get_vector3', 'variables_get_scalar'])
const SET_TYPES = new Set(['variables_set_obj3D', 'variables_set_vector3', 'variables_set_scalar'])
const WARNING_ID = 'geoScratchVarOrder'

function walkBlock(block, visited, visit) {
  if (!block || visited.has(block.id)) return
  visited.add(block.id)
  visit(block)
  for (const input of block.inputList) {
    const target = input.connection?.targetBlock()
    if (target) walkBlock(target, visited, visit)
  }
  const next = block.getNextBlock()
  if (next) walkBlock(next, visited, visit)
}

function resolveGetVarName(workspace, block) {
  const id = block.getFieldValue('VAR')
  return workspace.getVariableMap().getVariableById(id)?.name ?? id
}

// One description of "this block writes a value" / "this block reads one",
// covering both the typed set/get pairs and the variable wrapper + its
// references, so the stack-ordering logic below is written once.
function describeBlock(workspace, block) {
  if (SET_TYPES.has(block.type)) {
    return { role: 'set', key: block.getFieldValue('VAR') }
  }
  if (GET_TYPES.includes(block.type)) {
    const name = resolveGetVarName(workspace, block)
    return { role: 'get', key: name, label: name }
  }
  if (block.type === 'geo_variable') {
    const refId = getRefId(block)
    return refId ? { role: 'set', key: refId, label: getDisplayName(block) } : null
  }
  if (block.type === 'geo_variable_ref') {
    const target = getRefTarget(block)
    if (!target?.targetRefId) return null
    return { role: 'get', key: target.targetRefId, label: target.lastKnownName || 'this variable', isRef: true }
  }
  return null
}

function isReaderType(blockType) {
  return GET_TYPES.includes(blockType) || blockType === 'geo_variable_ref'
}

export function validateVariableOrdering(workspace) {
  if (!workspace) return

  workspace.getAllBlocks(false).forEach((block) => {
    if (isReaderType(block.type)) block.setWarningText?.(null, WARNING_ID)
  })

  const topBlocks = workspace.getTopBlocks(true)
  const stacks = topBlocks.map((top) => {
    const setKeys = new Set()
    const getsByKey = new Map()
    walkBlock(top, new Set(), (block) => {
      const described = describeBlock(workspace, block)
      if (!described) return
      if (described.role === 'set') {
        setKeys.add(described.key)
      } else {
        if (!getsByKey.has(described.key)) getsByKey.set(described.key, [])
        getsByKey.get(described.key).push({ block, ...described })
      }
    })
    return { setKeys, getsByKey }
  })

  const firstSetStackForKey = new Map()
  stacks.forEach(({ setKeys }, index) => {
    setKeys.forEach((key) => {
      if (!firstSetStackForKey.has(key)) firstSetStackForKey.set(key, index)
    })
  })

  stacks.forEach(({ getsByKey }, index) => {
    getsByKey.forEach((readers, key) => {
      const firstSet = firstSetStackForKey.get(key)
      readers.forEach(({ block, label, isRef }) => {
        const name = label || key
        if (firstSet === undefined) {
          block.setWarningText?.(
            isRef
              ? `"${name}" no longer exists -- the block this reference pointed at was deleted.`
              : `"${name}" is never set anywhere in this workspace.`,
            WARNING_ID,
          )
        } else if (index < firstSet) {
          block.setWarningText?.(
            isRef
              ? `This uses "${name}" before it is set -- move the "${name}" block above this one.`
              : `This uses "${name}" before it is set -- move the "set ${name}" block above this one.`,
            WARNING_ID,
          )
        }
      })
    })
  })
}
