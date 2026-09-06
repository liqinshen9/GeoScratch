import THREE from '@/utils/three'

/**
 * Formatting and anchor-resolution helpers shared by the label layer and the
 * declutter simulation.
 */

function fmtVec(v) {
  if (!v) return '[?, ?, ?]'
  const n = (x) => (Number.isFinite(x) ? +x.toFixed(3) : x)
  return `[${n(v.x)}, ${n(v.y)}, ${n(v.z)}]`
}

// Accepts '#rrggbb' or 0xrrggbb and returns an rgba() string at the given alpha.
function hexToRgba(color, alpha) {
  const hex = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16)
  if (!Number.isFinite(hex)) return null
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function resolveAnchor(object3D, anchorName) {
  const ud = object3D.userData || {}

  if (anchorName === 'origin' && ud.origin) {
    const { x, y, z } = ud.origin
    return [x, y, z]
  }
  if (anchorName === 'rPoint' && ud.rPoint) {
    const { x, y, z } = ud.rPoint
    return [x, y, z]
  }

  const dict = ud.labelAnchors || {}
  const entry = dict[anchorName]
  if (!entry || !entry.position || entry.position.length !== 3) return null

  const v = new THREE.Vector3(entry.position[0], entry.position[1], entry.position[2])
  if (entry.type === 'local') {
    object3D.localToWorld(v)
  }
  return [v.x, v.y, v.z]
}

export { fmtVec, hexToRgba, resolveAnchor }
