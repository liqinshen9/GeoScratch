// Small stable integer IDs for haloable objects (the discard shader's
// self-occlusion guard). Stable across regenerations for the same blockId.
// 0 = no object, 255 unused as a margin, 1..254 for objects.
// See docs/architecture/halos.md.
const MAX_ID = 254
const idByBlockId = new Map()
let nextId = 1

export function getHaloId(blockId) {
  const key = String(blockId)
  const existing = idByBlockId.get(key)
  if (existing !== undefined) return existing

  const id = nextId
  nextId = nextId >= MAX_ID ? 1 : nextId + 1
  idByBlockId.set(key, id)
  return id
}
