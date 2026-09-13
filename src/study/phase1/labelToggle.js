import { getLabelVisibilityKeysForObject } from '@/components/Scene3D/labels/labelData'
import { targetBlockIds } from './stimulusToXml'

/** The label keys a click on `object` toggles. Only targets A and B have any. */
export function targetLabelKeys(stimulus, object) {
  const id = object?.userData?.srcBlockId
  if (!stimulus || id == null) return []
  if (!Object.values(targetBlockIds(stimulus)).includes(String(id))) return []
  return getLabelVisibilityKeysForObject(object)
}

/** Hides the keys if any is showing, otherwise shows them all. Returns a new set. */
export function toggleLabelKeys(hidden, keys) {
  const allHidden = keys.every((key) => hidden.has(key))
  const next = new Set(hidden)
  keys.forEach((key) => (allHidden ? next.delete(key) : next.add(key)))
  return next
}
