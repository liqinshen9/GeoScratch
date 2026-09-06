import * as Blockly from 'blockly/core'
import { blockMoveChangesGeneratedCode } from '@/utils/blocklyEventFilters'

// Single source of truth for "what is this object called" -- replaces the
// two previously-disconnected systems: vectorNotation.js's ephemeral,
// run-order-dependent L1/P/v/Q1 counters (only ever reached generated
// runtime code, never the block itself) and blockReferenceLabels.js's
// separate, collapse-only Line1/Sphere1/a-z alias system. Both the block's
// own face (FieldObjectName), the 3D-scene label, and the collapse-to-
// reference bubble now read a name from here.
//
// A number is assigned ONCE, when a block is created (an installed
// Blockly.Events.BLOCK_CREATE listener), never recomputed from code-
// generation order -- so deleting an earlier object of the same kind never
// renumbers a later one. Numbers are monotonic per kind per workspace and
// never reused. Persisted on block.data (survives save/reload, same
// mechanism blockReferenceLabels.js already relied on for its aliases) under
// one namespaced key so a block carries exactly one naming record.

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
  // The variable wrapper mirrors the name of whatever is plugged into it
  // (wrapping Line1 makes its references read "Line1"), falling back to its
  // own auto name while empty or while wrapping something anonymous like a
  // compute result. `adoptsNameFromInput` is what getDisplayName keys off.
  variable: {
    blockTypes: ['geo_variable'],
    short: 'Var',
    descriptive: 'Variable',
    adoptsNameFromInput: 'VALUE',
  },
})

const BLOCK_TYPE_TO_KIND = Object.fromEntries(
  Object.entries(NAMEABLE_KIND_CONFIG).flatMap(([kind, cfg]) => cfg.blockTypes.map((type) => [type, kind]))
)

export function kindForBlockType(blockType) {
  return BLOCK_TYPE_TO_KIND[blockType] || null
}

export function isNameable(block) {
  return Boolean(block && !block.isInFlyout && kindForBlockType(block.type))
}

// ---------------------------------------------------------------------
// Persisted per-block naming record, namespaced within block.data (which
// may also hold other JSON payloads -- currently just this one, but keeping
// it namespaced avoids ever colliding with something else that reads/writes
// block.data in the future).
// ---------------------------------------------------------------------

function readAllData(block) {
  if (!block?.data) return {}
  try {
    const parsed = JSON.parse(block.data)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Generic namespaced block.data access -- the variable wrapper's reference
// blocks store their own payload alongside the naming record, and need the
// exact same "write it AND fire a real BlockChange" behaviour (see below).
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
  // Blockly's Block has no setData() -- `data` is a plain property with no
  // setter, so writing it directly (as blockReferenceLabels.js used to)
  // fires no event and never reaches setupChangeListener.js's auto-rerun.
  // Fire the same BlockChange event Blockly's own field/comment/collapsed
  // setters fire, so a rename actually propagates to the 3D scene.
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

// ---------------------------------------------------------------------
// Per-workspace counters (monotonic, increment-only, rehydrated from the
// max already-persisted number per kind -- never a separately persisted
// value, so there is nothing to get out of sync on load).
// ---------------------------------------------------------------------

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

// Exported because a workspace can be populated with events disabled (see
// BlocksCanvas.jsx's saved-XML restore), which bypasses the BLOCK_CREATE
// listener entirely and would otherwise leave the counters at zero -- the
// next new block would then collide with a restored one.
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

// The first number whose name is free in BOTH naming styles -- a custom-named
// block can be sitting on "L3", and the style is a live setting that can flip
// at any time, so a number is only safe if neither rendering of it collides.
function nextFreeNumber(workspace, block, kind) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const number = nextNumber(workspace, kind)
    const shortName = formatAutoName(kind, number, 'short')
    const descriptiveName = formatAutoName(kind, number, 'descriptive')
    if (!isNameTaken(workspace, shortName, block.id) && !isNameTaken(workspace, descriptiveName, block.id)) {
      return number
    }
  }
  return nextNumber(workspace, kind)
}

// A record is "taken" when another block is already using this exact name, or
// already holds this exact {kind, number} identity. The second check matters
// because the first is style-sensitive: two blocks both holding {line, 1}
// collide in either style, but a custom "L1" only collides under `short`.
function isRecordTaken(workspace, block, record) {
  const name = record.custom || formatAutoName(record.kind, record.number, currentNamingStyle())
  if (isNameTaken(workspace, name, block.id)) return true
  return workspace.getAllBlocks(false).some((other) => {
    if (other.id === block.id) return false
    const otherData = readNamingData(other)
    return otherData?.kind === record.kind && otherData?.number === record.number
  })
}

// `resolveConflicts` is only set from the BLOCK_CREATE path. Blockly's
// Duplicate/paste copies block.data verbatim (it's a serialized property),
// so a copy arrives already carrying the original's name -- detect that the
// record is already in use and reassign. A workspace restored from saved XML
// must NOT go through this: every block there legitimately arrives with its
// own unique record and has to keep it.
function ensureAssigned(workspace, block, { resolveConflicts = false } = {}) {
  if (!isNameable(block)) return
  const kind = kindForBlockType(block.type)
  const existing = readNamingData(block)
  const hasPlausibleRecord = existing?.kind === kind && Number.isFinite(existing.number)
  const conflicted = hasPlausibleRecord && resolveConflicts && isRecordTaken(workspace, block, existing)
  if (hasPlausibleRecord && !conflicted) return

  writeNamingData(block, {
    kind,
    number: nextFreeNumber(workspace, block, kind),
    // A copy must not keep a hand-picked name (two blocks called "Origin" is
    // the exact problem this fixes) or the original's refId -- variable
    // references are keyed by refId, so a shared one would let a duplicated
    // wrapper silently hijack the original's references.
    custom: conflicted ? null : (existing?.custom ?? null),
    refId: conflicted ? genRefId() : (existing?.refId || genRefId()),
  })
  // Covers FieldObjectName instances whose initial refresh() happened to run
  // before this assignment (creation-order race with initView).
  notifyBlockNameChanged(block)
}

export function installNamingRegistry(workspace) {
  if (!workspace || installedWorkspaces.has(workspace)) return
  installedWorkspaces.add(workspace)

  refreshNamingCounters(workspace)
  // Assign names to anything already present (e.g. a workspace just loaded
  // from saved XML) that doesn't have a naming record yet. Deliberately
  // without conflict resolution -- see ensureAssigned.
  workspace.getAllBlocks(false).forEach((block) => ensureAssigned(workspace, block))

  workspace.addChangeListener((event) => {
    // A deleted block can be something a variable reference was pointing at,
    // so every name-displaying field has to re-resolve -- otherwise a
    // reference keeps showing the name of a block that no longer exists.
    if (event?.type === Blockly.Events.BLOCK_DELETE) {
      notifyNamingChanged()
      return
    }
    // A connection change can change what a name RESOLVES to -- the variable
    // wrapper adopts the name of whatever is plugged into it -- so re-resolve
    // when blocks are actually re-parented (not on every drag pixel).
    if (event?.type === Blockly.Events.BLOCK_MOVE && blockMoveChangesGeneratedCode(event)) {
      notifyNamingChanged()
      return
    }
    if (event?.type !== Blockly.Events.BLOCK_CREATE) return
    const ids = event.ids || (event.blockId ? [event.blockId] : [])
    // Join the originating event's undo group. Blockly delivers BLOCK_CREATE
    // asynchronously, so without this the rename lands in its own group and
    // one Ctrl+Z would only revert the rename (the duplicate visibly snapping
    // back to the original's name) rather than removing the duplicate.
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

// The name a block borrows from the block plugged into it, for kinds
// configured with `adoptsNameFromInput` (the variable wrapper). Empty when
// nothing is plugged in or what's plugged in has no name of its own.
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

// False when a block is only mirroring someone else's name, so an adopting
// wrapper never counts as a collision against the block it borrows from.
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
    .some((block) => (
      block.id !== excludeBlockId &&
      ownsDisplayName(block) &&
      getDisplayName(block) === trimmed
    ))
}

// ---------------------------------------------------------------------
// Subscriptions -- keyed flat by blockId (Blockly ids are unique within a
// running app), so callers don't need to thread the owning workspace
// through just to subscribe/unsubscribe.
// ---------------------------------------------------------------------

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
  // Also global: a variable reference displays a DIFFERENT block's name (the
  // wrapper it points at), so it can't usefully subscribe to one fixed block
  // id -- it listens globally and re-resolves instead.
  globalSubscribers.forEach((cb) => cb())
}

export function subscribeToNamingChanges(callback) {
  globalSubscribers.add(callback)
  return () => globalSubscribers.delete(callback)
}

// Ask every name-displaying field to re-resolve, without naming a specific
// block -- used when what changed is which blocks EXIST (a deletion), not a
// particular block's own name.
export function notifyNamingChanged() {
  globalSubscribers.forEach((cb) => cb())
}

export function notifyAllBlockNamesChanged(workspace) {
  if (!workspace) return
  workspace.getAllBlocks(false).forEach((block) => notifyBlockNameChanged(block))
  globalSubscribers.forEach((cb) => cb())
}

// ---------------------------------------------------------------------
// Rename (used by both the generalized "Rename" context-menu item and the
// still-collapse-specific "Rename reference" item in blockReferenceLabels.js)
// ---------------------------------------------------------------------

// Not gated on isNameable: a pooled single-letter alias (blockReferenceLabels.js's
// "collapse to reference" on an anonymous compute-result operand) is stored
// the same way as a real object's custom name, purely as `custom` with no
// `kind`/`number` -- so both kinds of name share one uniqueness check
// (isNameTaken) and can never collide.
export function setCustomName(block, name) {
  if (!block) return
  if (isNameable(block)) ensureAssigned(block.workspace, block)
  const existing = readNamingData(block) || { kind: kindForBlockType(block.type), number: null, custom: null, refId: null }
  const trimmed = String(name || '').trim()
  writeNamingData(block, { ...existing, custom: trimmed || null, refId: existing.refId || genRefId() })
  notifyBlockNameChanged(block)
}

export function clearCustomName(block) {
  setCustomName(block, null)
}

// ---------------------------------------------------------------------
// Runtime-code-safe lookup -- exposed as window.geoNaming by
// generateAndRun.js, same pattern as window.vectorNotation.
// ---------------------------------------------------------------------

// Variable references pair with their wrapper by refId, not by block id:
// refId survives addCompositeBlockToWorkspace (which strips every id
// attribute but leaves <data> alone), and a duplicated wrapper gets a fresh
// one so it can never hijack the original's references.
export function findBlockByRefId(workspace, refId) {
  if (!workspace || !refId) return null
  return workspace.getAllBlocks(false).find((block) => readNamingData(block)?.refId === refId) ?? null
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
