import * as Blockly from 'blockly/core'
import { blockMoveChangesGeneratedCode } from '@/utils/blocklyEventFilters'

// Single source of truth for "what is this object called". Assign-once, per
// kind per workspace, persisted on block.data.
// See docs/architecture/naming-registry.md.

const DATA_NAMESPACE = 'geoScratchNaming'

export const NAMEABLE_KIND_CONFIG = Object.freeze({
  line: { blockTypes: ['geo_vector'], short: 'L', descriptive: 'Line' },
  point: { blockTypes: ['linalg_point'], short: 'P', descriptive: 'Point' },
  vector: { blockTypes: ['linalg_vec3'], short: 'V', descriptive: 'Vector' },
  sphere: { blockTypes: ['geo_sphere'], short: 'Sp', descriptive: 'Sphere' },
  plane: { blockTypes: ['parametric_plane'], short: 'Pl', descriptive: 'Plane' },
  cube: { blockTypes: ['geo_cube'], short: 'C', descriptive: 'Cube' },
  teapot: { blockTypes: ['geo_teapot'], short: 'T', descriptive: 'Teapot' },
  scalar: { blockTypes: ['scalar'], short: 'k', descriptive: 'Scalar' },
  genericPoint: { blockTypes: ['geo_show_point_on_object'], short: 'Q', descriptive: 'Point' },
  // adoptsNameFromInput: the wrapper mirrors its input's name.
  // See docs/architecture/naming-registry.md#the-variable-wrapper.
  variable: {
    blockTypes: ['geo_variable'],
    short: 'Var',
    descriptive: 'Variable',
    adoptsNameFromInput: 'VALUE',
  },
})

const BLOCK_TYPE_TO_KIND = Object.fromEntries(
  Object.entries(NAMEABLE_KIND_CONFIG).flatMap(([kind, cfg]) =>
    cfg.blockTypes.map((type) => [type, kind]),
  ),
)

export function kindForBlockType(blockType) {
  return BLOCK_TYPE_TO_KIND[blockType] || null
}

export function isNameable(block) {
  return Boolean(block && !block.isInFlyout && kindForBlockType(block.type))
}

// Persisted per-block naming record, namespaced within block.data.

function readAllData(block) {
  if (!block?.data) return {}
  try {
    const parsed = JSON.parse(block.data)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Generic namespaced block.data access -- also used by the variable
// wrapper's reference blocks for their own payload.
export function readBlockData(block, namespace) {
  return readAllData(block)[namespace] || null
}

export function writeBlockData(block, namespace, value) {
  const all = readAllData(block)
  if (value) all[namespace] = value
  else delete all[namespace]
  const oldData = block.data
  const newData = Object.keys(all).length ? JSON.stringify(all) : null
  block.data = newData
  // Must fire BlockChange by hand -- there is no setData().
  // See docs/architecture/naming-registry.md#no-setdata.
  if (oldData !== newData) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'data', null, oldData, newData))
  }
}

function readNamingData(block) {
  return readBlockData(block, DATA_NAMESPACE)
}

function writeNamingData(block, namingData) {
  writeBlockData(block, DATA_NAMESPACE, namingData)
}

function genRefId() {
  return `ref-${Blockly.utils.idGenerator.genUid()}`
}

// Per-workspace counters, rehydrated from the max persisted number per kind.
// See docs/architecture/naming-registry.md#assign-once-semantics.

const workspaceCounters = new WeakMap()
const installedWorkspaces = new WeakSet()

function getCounters(workspace) {
  let counters = workspaceCounters.get(workspace)
  if (!counters) {
    counters = {}
    workspaceCounters.set(workspace, counters)
  }
  return counters
}

// Exported for the events-disabled saved-XML restore path.
// See docs/architecture/naming-registry.md#refresh-counters-on-eventless-restore.
export function refreshNamingCounters(workspace) {
  if (!workspace) return
  const counters = {}
  workspace.getAllBlocks(false).forEach((block) => {
    const data = readNamingData(block)
    if (!data?.kind || !Number.isFinite(data.number)) return
    counters[data.kind] = Math.max(counters[data.kind] || 0, data.number)
  })
  workspaceCounters.set(workspace, counters)
}

function nextNumber(workspace, kind) {
  const counters = getCounters(workspace)
  const next = (counters[kind] || 0) + 1
  counters[kind] = next
  return next
}

// First number free in BOTH naming styles.
// See docs/architecture/naming-registry.md#dual-style-free-check.
function nextFreeNumber(workspace, block, kind) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const number = nextNumber(workspace, kind)
    const shortName = formatAutoName(kind, number, 'short')
    const descriptiveName = formatAutoName(kind, number, 'descriptive')
    if (
      !isNameTaken(workspace, shortName, block.id) &&
      !isNameTaken(workspace, descriptiveName, block.id)
    ) {
      return number
    }
  }
  return nextNumber(workspace, kind)
}

// Taken = another block uses this exact name OR holds this {kind, number}.
// See docs/architecture/naming-registry.md#dual-style-free-check.
function isRecordTaken(workspace, block, record) {
  const name = record.custom || formatAutoName(record.kind, record.number, currentNamingStyle())
  if (isNameTaken(workspace, name, block.id)) return true
  return workspace.getAllBlocks(false).some((other) => {
    if (other.id === block.id) return false
    const otherData = readNamingData(other)
    return otherData?.kind === record.kind && otherData?.number === record.number
  })
}

// resolveConflicts is only set from the BLOCK_CREATE path (never saved-XML
// restore). See docs/architecture/naming-registry.md#create-only-conflict-resolution.
function ensureAssigned(workspace, block, { resolveConflicts = false } = {}) {
  if (!isNameable(block)) return
  const kind = kindForBlockType(block.type)
  const existing = readNamingData(block)
  const hasPlausibleRecord = existing?.kind === kind && Number.isFinite(existing.number)
  const conflicted =
    hasPlausibleRecord && resolveConflicts && isRecordTaken(workspace, block, existing)
  if (hasPlausibleRecord && !conflicted) return

  writeNamingData(block, {
    kind,
    number: nextFreeNumber(workspace, block, kind),
    // A conflicted copy drops custom + refId.
    // See docs/architecture/naming-registry.md#copy-drops-custom-and-refid.
    custom: conflicted ? null : (existing?.custom ?? null),
    refId: conflicted ? genRefId() : existing?.refId || genRefId(),
  })
  // Covers a FieldObjectName whose initial refresh() raced this assignment.
  notifyBlockNameChanged(block)
}

export function installNamingRegistry(workspace) {
  if (!workspace || installedWorkspaces.has(workspace)) return
  installedWorkspaces.add(workspace)

  refreshNamingCounters(workspace)
  // Assign to anything already present, without conflict resolution.
  workspace.getAllBlocks(false).forEach((block) => ensureAssigned(workspace, block))

  workspace.addChangeListener((event) => {
    // A deletion or re-parent can change what a reference name resolves to.
    if (event?.type === Blockly.Events.BLOCK_DELETE) {
      notifyNamingChanged()
      return
    }
    if (event?.type === Blockly.Events.BLOCK_MOVE && blockMoveChangesGeneratedCode(event)) {
      notifyNamingChanged()
      return
    }
    if (event?.type !== Blockly.Events.BLOCK_CREATE) return
    const ids = event.ids || (event.blockId ? [event.blockId] : [])
    // Join the originating event's undo group.
    // See docs/architecture/naming-registry.md#undo-group-join.
    const previousGroup = Blockly.Events.getGroup()
    Blockly.Events.setGroup(event.group || previousGroup || true)
    try {
      ids.forEach((id) => {
        const block = workspace.getBlockById(id)
        if (block) ensureAssigned(workspace, block, { resolveConflicts: true })
      })
    } finally {
      Blockly.Events.setGroup(previousGroup)
    }
  })
}

// ---------------------------------------------------------------------
// Display name
// ---------------------------------------------------------------------

function currentNamingStyle() {
  const store = typeof window !== 'undefined' ? window.useSettingsStore : null
  return store?.getState().settings.namingStyle || 'short'
}

function formatAutoName(kind, number, style) {
  const cfg = NAMEABLE_KIND_CONFIG[kind]
  const base = (style === 'descriptive' ? cfg?.descriptive : cfg?.short) || kind
  return `${base}${number}`
}

// The name a block borrows from its input, for `adoptsNameFromInput` kinds.
// See docs/architecture/naming-registry.md#the-variable-wrapper.
function adoptedName(block, styleOverride) {
  const inputName = NAMEABLE_KIND_CONFIG[kindForBlockType(block?.type)]?.adoptsNameFromInput
  if (!inputName) return ''
  const inner = block.getInputTargetBlock?.(inputName)
  return inner ? getDisplayName(inner, styleOverride) : ''
}

export function getDisplayName(block, styleOverride) {
  const data = readNamingData(block)
  if (!data) return ''
  const adopted = adoptedName(block, styleOverride)
  if (adopted) return adopted
  if (data.custom) return data.custom
  return formatAutoName(data.kind, data.number, styleOverride || currentNamingStyle())
}

// False for an adopting wrapper, so it never collides with the block it mirrors.
export function ownsDisplayName(block) {
  return Boolean(readNamingData(block)) && !adoptedName(block)
}

export function isCustomNamed(block) {
  return Boolean(readNamingData(block)?.custom)
}

export function isNameTaken(workspace, name, excludeBlockId) {
  const trimmed = String(name || '').trim()
  if (!trimmed || !workspace) return false
  return workspace
    .getAllBlocks(false)
    .some(
      (block) =>
        block.id !== excludeBlockId && ownsDisplayName(block) && getDisplayName(block) === trimmed,
    )
}

// Subscriptions, keyed flat by blockId.
// See docs/architecture/naming-registry.md#subscriptions.

const blockSubscribers = new Map()
const globalSubscribers = new Set()

export function subscribeToBlockName(blockId, callback) {
  let set = blockSubscribers.get(blockId)
  if (!set) {
    set = new Set()
    blockSubscribers.set(blockId, set)
  }
  set.add(callback)
  return () => {
    set.delete(callback)
    if (set.size === 0) blockSubscribers.delete(blockId)
  }
}

function notifyBlockNameChanged(block) {
  blockSubscribers.get(block.id)?.forEach((cb) => cb())
  // Also global -- variable references display another block's name.
  globalSubscribers.forEach((cb) => cb())
}

export function subscribeToNamingChanges(callback) {
  globalSubscribers.add(callback)
  return () => globalSubscribers.delete(callback)
}

// Ask every name-displaying field to re-resolve (used on deletion/re-parent).
export function notifyNamingChanged() {
  globalSubscribers.forEach((cb) => cb())
}

export function notifyAllBlockNamesChanged(workspace) {
  if (!workspace) return
  workspace.getAllBlocks(false).forEach((block) => notifyBlockNameChanged(block))
  globalSubscribers.forEach((cb) => cb())
}

// Not gated on isNameable -- also stores pooled single-letter aliases.
// See docs/architecture/naming-registry.md#pooled-alias-not-nameable.
export function setCustomName(block, name) {
  if (!block) return
  if (isNameable(block)) ensureAssigned(block.workspace, block)
  const existing = readNamingData(block) || {
    kind: kindForBlockType(block.type),
    number: null,
    custom: null,
    refId: null,
  }
  const trimmed = String(name || '').trim()
  writeNamingData(block, {
    ...existing,
    custom: trimmed || null,
    refId: existing.refId || genRefId(),
  })
  notifyBlockNameChanged(block)
}

export function clearCustomName(block) {
  setCustomName(block, null)
}

// Runtime lookup, exposed as window.geoNaming by generateAndRun.js.

// References pair with their wrapper by refId, not block id.
// See docs/architecture/naming-registry.md#the-variable-wrapper.
export function findBlockByRefId(workspace, refId) {
  if (!workspace || !refId) return null
  return (
    workspace.getAllBlocks(false).find((block) => readNamingData(block)?.refId === refId) ?? null
  )
}

export function getRefId(block) {
  return readNamingData(block)?.refId ?? null
}

export function nameForBlockId(workspace, blockId) {
  if (!workspace || !blockId) return ''
  const block = workspace.getBlockById(blockId)
  return block ? getDisplayName(block) : ''
}

export function createRuntimeAccessor(workspace) {
  return {
    nameFor: (blockId) => nameForBlockId(workspace, blockId),
  }
}
