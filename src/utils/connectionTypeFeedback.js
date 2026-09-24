import * as Blockly from 'blockly/core'

export const CONNECTION_TYPE_LABELS = Object.freeze({
  scalar: 'Scalar',
  vector3: 'Vector',
  vector4: 'Vector4',
  obj3D: '3D Object',
  matrix3: '3x3 Matrix',
  matrix4: '4x4 Matrix',
  rotMat: 'Rotation Matrix',
  transMat: 'Translation Matrix',
  scaleMat: 'Scale Matrix',
  transformStep: 'Transform Step',
})

const INSERT_INTENT_DISTANCE = 12

export function formatConnectionTypes(checks) {
  const types = Array.isArray(checks) ? checks : checks ? [checks] : []
  const labels = types.map((type) => CONNECTION_TYPE_LABELS[type] || type)

  if (labels.length < 2) return labels[0] || 'Any Value'
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`
}

export function describeTypeMismatch(firstConnection, secondConnection) {
  if (!firstConnection || !secondConnection) return null

  const checker = firstConnection.getConnectionChecker?.()
  if (
    !checker ||
    checker.canConnectWithReason(firstConnection, secondConnection, false) !==
      Blockly.Connection.REASON_CHECKS_FAILED
  ) {
    return null
  }

  return formatTypeMismatch(firstConnection, secondConnection)
}

function formatTypeMismatch(firstConnection, secondConnection) {
  const inputConnection = firstConnection.isSuperior() ? firstConnection : secondConnection
  const outputConnection = inputConnection === firstConnection ? secondConnection : firstConnection
  const expected = formatConnectionTypes(inputConnection.getCheck())
  const provided = formatConnectionTypes(outputConnection.getCheck())
  const socket = inputConnection.type === Blockly.ConnectionType.INPUT_VALUE ? 'input' : 'slot'

  return `This ${socket} needs ${expected}, but this block gives ${provided}.`
}

function connectedOutsideDraggedGroup(workspace, draggedBlockId) {
  const draggedRoot = workspace.getBlockById?.(draggedBlockId)
  if (!draggedRoot) return false

  const draggedBlocks = draggedRoot.getDescendants?.(false) || [draggedRoot]
  const draggedIds = new Set(draggedBlocks.map((block) => block.id))

  return draggedBlocks.some((block) =>
    (block.getConnections_?.(false) || []).some((connection) => {
      const targetBlock = connection.targetConnection?.getSourceBlock?.()
      return targetBlock && !draggedIds.has(targetBlock.id)
    }),
  )
}

function getDraggedBlockId(workspace, event) {
  if (event.blockId && workspace.getBlockById?.(event.blockId)) return event.blockId
  return (event.blocks || [])
    .map((block) => (typeof block === 'string' ? block : block?.id))
    .find((blockId) => blockId && workspace.getBlockById?.(blockId))
}

export function installConnectionTypeFeedback(workspace, onFeedback) {
  const checker = workspace.connectionChecker
  const originalCanConnectWithReason = checker.canConnectWithReason
  let recentMismatch = null
  let draggedBlockIds = new Set()
  let activeDraggedBlockId = null

  const trackedCanConnectWithReason = function (first, second, isDragging, distance) {
    const reason = originalCanConnectWithReason.call(this, first, second, isDragging, distance)
    const firstIsDragged = draggedBlockIds.has(first?.getSourceBlock?.().id)
    const secondIsDragged = draggedBlockIds.has(second?.getSourceBlock?.().id)
    const draggedConnection = firstIsDragged && !secondIsDragged ? first : secondIsDragged ? second : null
    const targetConnection = draggedConnection === first ? second : first
    const connectionDistance = draggedConnection?.distanceFrom?.(targetConnection)

    const isDraggedOutputToInput =
      isDragging &&
      draggedConnection &&
      !draggedConnection.isSuperior() &&
      targetConnection?.isSuperior()

    if (
      isDraggedOutputToInput &&
      reason === Blockly.Connection.REASON_CHECKS_FAILED &&
      Number.isFinite(connectionDistance) &&
      connectionDistance <= INSERT_INTENT_DISTANCE
    ) {
      recentMismatch = {
        draggedConnection,
        message: formatTypeMismatch(first, second),
        targetConnection,
      }
    } else if (
      isDraggedOutputToInput &&
      recentMismatch?.draggedConnection === draggedConnection &&
      recentMismatch.targetConnection === targetConnection
    ) {
      recentMismatch = null
    }
    return reason
  }

  checker.canConnectWithReason = trackedCanConnectWithReason

  const listener = (event) => {
    if (event?.type === Blockly.Events.BLOCK_DELETE) {
      recentMismatch = null
      draggedBlockIds = new Set()
      activeDraggedBlockId = null
      onFeedback?.('')
      return
    }
    if (event?.type !== Blockly.Events.BLOCK_DRAG) return
    if (event.isStart) {
      recentMismatch = null
      const draggedBlockId = getDraggedBlockId(workspace, event)
      activeDraggedBlockId = draggedBlockId || null
      const draggedRoot = workspace.getBlockById?.(draggedBlockId)
      const draggedBlocks = [
        ...(event.blocks || []),
        ...(draggedRoot?.getDescendants?.(false) || []),
      ]
      draggedBlockIds = new Set(
        draggedBlocks
          .map((block) => (typeof block === 'string' ? block : block?.id))
          .filter(Boolean),
      )
      onFeedback?.('')
      return
    }

    const draggedBlockId = getDraggedBlockId(workspace, event) || activeDraggedBlockId
    const mismatch = recentMismatch
    recentMismatch = null
    draggedBlockIds = new Set()
    activeDraggedBlockId = null
    if (!mismatch) return
    if (draggedBlockId && connectedOutsideDraggedGroup(workspace, draggedBlockId)) return

    onFeedback?.(mismatch.message)
  }

  workspace.addChangeListener(listener)
  return () => {
    workspace.removeChangeListener(listener)
    if (checker.canConnectWithReason === trackedCanConnectWithReason) {
      checker.canConnectWithReason = originalCanConnectWithReason
    }
  }
}
