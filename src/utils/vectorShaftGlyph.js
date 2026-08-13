import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES } from '@/store/lineStyles'

// Every size below is an eyeballed number, tuned per style independently --
// there's no formula linking them, so just edit a number to change how a
// style looks.

// Plain Line: a flat GL line (constant pixel width, doesn't get thinner far away)
const LINE_SHAFT_PX = 4.6
const LINE_HEAD_RADIUS = 0.2
const LINE_HEAD_LENGTH = 0.35

// Plain Tube: a solid cylinder
const TUBE_SHAFT_RADIUS = 0.045
const TUBE_HEAD_RADIUS = 0.2
const TUBE_HEAD_LENGTH = 0.35

// Ringed Tube: a solid cylinder with a ring texture
const RINGED_SHAFT_RADIUS = 0.085
const RINGED_HEAD_RADIUS = 0.22
const RINGED_HEAD_LENGTH = 0.28
const RINGED_RING_PERIOD = 0.8
const RINGED_RADIAL_SEGMENTS = 48
const RINGED_HEIGHT_SEGMENTS = (length) => Math.max(1, Math.ceil(length / RINGED_RING_PERIOD) * 2)

// Never let a very short vector produce a negative/zero shaft length.
const MIN_SHAFT_LENGTH = 0.001

const VECTOR_COLOR = 0x15803d
const RINGED_BAND_A = 0x22a355
const RINGED_BAND_B = 0x14532d

// headLength is the active style's own cone length (LINE/TUBE/RINGED_HEAD_LENGTH)
// -- the shaft stops exactly that far short of the true tip, so the cone
// (fixed length, never zoom-scaled -- see makeArrowhead) always reaches
// exactly to the true tip, matching where the object's label is anchored.
export function computeVectorShaftLayout(origin, direction, length, headLength) {
  const shaftLength = Math.max(length - headLength, MIN_SHAFT_LENGTH)
  const shaftMid = origin.clone().addScaledVector(direction, shaftLength / 2)
  const shaftEnd = origin.clone().addScaledVector(direction, shaftLength)
  return { shaftLength, shaftMid, shaftEnd }
}

// 2-color repeating texture, same technique as geoVectorLine.js's
// makeRingTexture -- duplicated rather than shared, see file-level note in
// buildVectorShaftGlyph.
function makeRingTexture(THREE, colorA, colorB) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const hex = (c) => '#' + c.toString(16).padStart(6, '0')
  ctx.fillStyle = hex(colorA)
  ctx.fillRect(0, 0, 4, 32)
  ctx.fillStyle = hex(colorB)
  ctx.fillRect(0, 32, 4, 32)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.anisotropy = 16
  return texture
}

function setRingTextureRepeat(texture, length, period) {
  texture.repeat.set(1, length / period)
}

function orient(object, from, to, THREE) {
  object.position.copy(from)
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to)
}

// Builds a vector's shaft (in all 3 styles, toggled by settings.vectorStyle)
// plus each style's own arrowhead cone, and live-reacts to Settings changes.
// Not shared with geoVectorLine.js -- a vector shaft is one finite,
// already-known segment (no collision zones, no halo, no dash-zoom-sync),
// so it's much simpler than that file's machinery.
export function buildVectorShaftGlyph(THREE, blockId, origin, direction, length) {
  const group = new THREE.Group()

  // Each style's shaft ends exactly its OWN cone's length short of the true
  // tip (origin + direction*length -- the same point the object's label is
  // anchored to), so every cone (fixed length, never zoom-scaled -- see
  // makeArrowhead) reaches exactly to the true tip, at any zoom/thickness.
  const lineLayout = computeVectorShaftLayout(origin, direction, length, LINE_HEAD_LENGTH)
  const tubeLayout = computeVectorShaftLayout(origin, direction, length, TUBE_HEAD_LENGTH)
  const ringedLayout = computeVectorShaftLayout(origin, direction, length, RINGED_HEAD_LENGTH)

  // Plain Line shaft
  const fatLineMat = new THREE.LineMaterial({ color: VECTOR_COLOR, linewidth: LINE_SHAFT_PX, worldUnits: false })
  const fatLineGeom = new THREE.LineSegmentsGeometry()
  fatLineGeom.setPositions([origin.x, origin.y, origin.z, lineLayout.shaftEnd.x, lineLayout.shaftEnd.y, lineLayout.shaftEnd.z])
  const fatLine = new THREE.LineSegments2(fatLineGeom, fatLineMat)
  fatLine.userData.isFatLine = true
  fatLine.userData.fatLineBaseWidth = LINE_SHAFT_PX
  fatLine.userData.thickenGroup = 'vector'
  group.add(fatLine)

  // Plain Tube shaft
  const tubeMat = new THREE.MeshStandardMaterial({ color: VECTOR_COLOR, roughness: 0.5, metalness: 0.1 })
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_SHAFT_RADIUS, TUBE_SHAFT_RADIUS, tubeLayout.shaftLength, 12), tubeMat)
  orient(tube, tubeLayout.shaftMid, direction, THREE)
  tube.userData.zoomInvariantRadius = TUBE_SHAFT_RADIUS
  tube.userData.thickenGroup = 'vector'
  group.add(tube)

  // Ringed Tube shaft
  const ringedTexture = makeRingTexture(THREE, RINGED_BAND_A, RINGED_BAND_B)
  setRingTextureRepeat(ringedTexture, ringedLayout.shaftLength, RINGED_RING_PERIOD)
  const ringedMat = new THREE.MeshStandardMaterial({
    map: ringedTexture,
    emissive: RINGED_BAND_A,
    emissiveIntensity: 0.15,
    roughness: 0.75,
    metalness: 0.15,
  })
  const ringedTube = new THREE.Mesh(
    new THREE.CylinderGeometry(
      RINGED_SHAFT_RADIUS,
      RINGED_SHAFT_RADIUS,
      ringedLayout.shaftLength,
      RINGED_RADIAL_SEGMENTS,
      RINGED_HEIGHT_SEGMENTS(ringedLayout.shaftLength)
    ),
    ringedMat
  )
  orient(ringedTube, ringedLayout.shaftMid, direction, THREE)
  ringedTube.userData.zoomInvariantRadius = RINGED_SHAFT_RADIUS
  ringedTube.userData.thickenGroup = 'vector'
  group.add(ringedTube)

  // Arrowhead cones -- one per style, anchored at their own shaftEnd via
  // their BASE (geometry translated so the base, not the centre, is the
  // local origin). Length is fixed (never zoom-scaled), same as the shaft
  // itself, so the tip always lands exactly on the true tip regardless of
  // zoom or Extra Thick Vectors -- only radius responds to those. A point
  // marker's label always tracks perfectly because a sphere scaled from its
  // own centre never moves; a cone scaled from its base does, which is
  // exactly what broke this before.
  const makeArrowhead = (radius, coneLength, shaftEnd, mat) => {
    const geom = new THREE.ConeGeometry(radius, coneLength, 12)
    geom.translate(0, coneLength / 2, 0)
    const mesh = new THREE.Mesh(geom, mat)
    orient(mesh, shaftEnd, direction, THREE)
    mesh.userData.zoomInvariantRadius = radius
    mesh.userData.thickenGroup = 'vector'
    group.add(mesh)
    return mesh
  }
  // Plain Line's cone is unlit to match its own flat, unshaded shaft.
  const coneLine = makeArrowhead(LINE_HEAD_RADIUS, LINE_HEAD_LENGTH, lineLayout.shaftEnd, new THREE.MeshLambertMaterial({ color: VECTOR_COLOR }))
  const coneTube = makeArrowhead(TUBE_HEAD_RADIUS, TUBE_HEAD_LENGTH, tubeLayout.shaftEnd, new THREE.MeshStandardMaterial({ color: VECTOR_COLOR, roughness: 0.4, metalness: 0.1 }))
  const coneRinged = makeArrowhead(RINGED_HEAD_RADIUS, RINGED_HEAD_LENGTH, ringedLayout.shaftEnd, new THREE.MeshStandardMaterial({ color: VECTOR_COLOR, roughness: 0.4, metalness: 0.1 }))

  const applyVectorStyle = (settings) => {
    const activeStyle = settings.vectorStyle || LINE_STYLES.PLAIN_LINE
    fatLine.visible = coneLine.visible = activeStyle === LINE_STYLES.PLAIN_LINE
    tube.visible = coneTube.visible = activeStyle === LINE_STYLES.PLAIN_TUBE
    ringedTube.visible = coneRinged.visible = activeStyle === LINE_STYLES.RINGED_TUBE
  }

  applyVectorStyle(useSettingsStore?.getState().settings || {})

  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== group) {
        unsubscribe()
        return
      }
      applyVectorStyle(state.settings)
    })
  }

  return group
}
