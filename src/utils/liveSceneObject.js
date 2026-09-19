/**
 * Whether an object a builder made is still part of what the current run
 * renders, so a subscription set up beside it knows when to drop itself.
 *
 * Identity in `threeObjStore` under the builder's own block id is not enough:
 * a wrapper block (Object with Point, Show any point on object) registers its
 * group under its own id and deletes the child's entry, so a nested object
 * still on screen would look stale and stop tracking settings changes.
 */
export function isLiveSceneObject(object, store) {
  if (!object || !store) return false
  const live = new Set(Object.values(store))
  for (let node = object; node; node = node.parent) {
    if (live.has(node)) return true
  }
  return false
}
