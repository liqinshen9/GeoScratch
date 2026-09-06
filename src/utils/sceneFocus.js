import THREE from '@/utils/three'

/**
 * Centre and radius of the scene's visible content, for auto-framing the camera.
 *
 * @param {object[]} objects Top-level scene objects.
 * @returns {{center: object, radius: number}|null} null when nothing is framable.
 */

export function getObjectFocus(objects) {
  const box = new THREE.Box3()
  const childBox = new THREE.Box3()
  let hasBounds = false

  objects.forEach((object) => {
    if (!object?.isObject3D) return
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      if (!child.isObject3D || child.userData?.geoType === 'plane_mesh') return
      if (!child.isMesh && !child.isLine && !child.isLineSegments) return

      childBox.setFromObject(child)
      if (childBox.isEmpty()) return
      box.union(childBox)
      hasBounds = true
    })
  })

  if (!hasBounds) return null
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  return {
    center,
    radius: Math.max(size.x, size.y, size.z, 1) * 0.5,
  }
}
