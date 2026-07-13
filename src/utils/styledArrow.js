// THREE.ArrowHelper's default look is a hairline (often near-invisible,
// unlit) shaft and a flat-shaded, unlit, low-poly cone. This builds a real
// ArrowHelper (so .setLength()/.setColor()/.setDirection() and any other
// ArrowHelper-specific behavior keep working unchanged) and just swaps its
// `.line`/`.cone` children for a lit, shaded cylinder + smooth cone that
// match the rest of the scene's materials.
export function createStyledArrow(THREE, dir, origin, length, color, headLength = length * 0.2, headWidth = headLength * 0.2) {
  const arrow = new THREE.ArrowHelper(dir, origin, length, color, headLength, headWidth)

  arrow.cone.geometry = new THREE.ConeGeometry(0.5, 1, 12, 1).translate(0, -0.5, 0)
  arrow.cone.material.dispose()
  arrow.cone.material = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.08 })

  const shaftRadius = Math.max(0.012, headWidth * 0.12)
  const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, 1, 8).translate(0, 0.5, 0)
  const shaftMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.08 })
  const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial)
  shaft.matrixAutoUpdate = false

  arrow.remove(arrow.line)
  arrow.line.material.dispose()
  arrow.line = shaft
  arrow.add(shaft)

  arrow.setLength(length, headLength, headWidth)
  return arrow
}
