// Warns on a variable `get` in a stack emitted before its `set`'s stack
// (stacks emit in on-screen order, not creation order). Per-stack granularity.
// See docs/architecture/naming-registry.md#variable-ordering-warnings-validatevariableorderingjs.

import { getRefId, getDisplayName } from '@/utils/namingRegistry'
import { getRefTarget } from '@/utils/variableReference'

const GET_TYPES = Object.freeze([
  'variables_get_obj3D',
  'variables_get_vector3',
  'variables_get_scalar',
])
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

// One "writes a value" / "reads one" description covering both typed set/get
// pairs and the wrapper + its references.
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
    return {
      role: 'get',
      key: target.targetRefId,
      label: target.lastKnownName || 'this variable',
      isRef: true,
    }
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
