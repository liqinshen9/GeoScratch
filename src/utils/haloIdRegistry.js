// Assigns small, stable integer IDs to haloable objects for the GPU
// depth-trick's self-occlusion guard -- an object must never halo-gap
// itself, which a depth-only comparison can't rule out at silhouette edges
// (a wider inflated surface bulges toward the camera more than the real one
// at grazing angles), so the discard shader also checks object identity.
// See docs/halos-epic-plan.md.
//
// IDs are stable across scene regenerations for the same blockId (a Map,
// not a per-generation reset) so a line's halo companion/material doesn't
// need rebuilding just because an unrelated object elsewhere changed.
//
// Encoded as id/255 in an 8-bit texture channel (HaloDepthPrepass's color
// attachment) -- 0 is reserved for "no object at this pixel" (cleared
// background), 255 is left unused as a round-trip safety margin, leaving
// 1..254 for actual objects.
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
