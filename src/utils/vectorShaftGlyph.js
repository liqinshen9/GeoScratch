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

// Ultimate fallback only -- reached if a caller omits `color` AND
// window.GeoScratchColors (colorSystem.js) isn't loaded yet. Every current
// call site passes an explicit color or relies on the GeoScratchColors
// lookup below, so in practice this is a defensive default, not the normal
// path.
const VECTOR_COLOR = 0x15803d

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

// Derives the ringed-tube's 2-tone band colors from the shaft's base color
// -- a lighter and a darker lightness step at the same hue/saturation -- so
// any colored vector (the default green, or an operand/result glyph reusing
// this builder with its own color) gets a consistent ring look.
function deriveRingBandColors(THREE, baseColor) {
  const hsl = {}
  new THREE.Color(baseColor).getHSL(hsl)
  const bandA = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.12)).getHex()
  const bandB = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.12)).getHex()
  return { bandA, bandB }
}

// `color` omitted -> this instance's color from the shared object-color
// framework (colorSystem.js), same as every other object type's glyph gets.
// `blockId` doubles as the color seed here, so a suffixed id (an
// operand/result glyph's own threeObjStore key, e.g. "<id>_u") still gets a
// stable, distinct color -- callers that care about a *specific* color
// (operand roles, a plane's normal matching its plane color, ...) just pass
// `color` explicitly and this lookup is skipped.
function resolveVectorColor(blockId, color) {
  if (color != null) return color
  const colors = typeof window !== 'undefined' ? window.GeoScratchColors : null
  return colors ? colors.forInstance('vector', blockId) : VECTOR_COLOR
}

// Builds a vector's shaft (in all 3 styles, toggled by settings.vectorStyle)
// plus each style's own arrowhead cone, and live-reacts to Settings changes.
// Not shared with geoVectorLine.js -- a vector shaft is one finite,
// already-known segment (no collision zones, no halo, no dash-zoom-sync),
// so it's much simpler than that file's machinery.
export function buildVectorShaftGlyph(THREE, blockId, origin, direction, length, color) {
  const group = new THREE.Group()
  const shaftColor = resolveVectorColor(blockId, color)
  const { bandA, bandB } = deriveRingBandColors(THREE, shaftColor)

  // Each style's shaft ends exactly its OWN cone's length short of the true
  // tip (origin + direction*length -- the same point the object's label is
  // anchored to), so every cone (fixed length, never zoom-scaled -- see
  // makeArrowhead) reaches exactly to the true tip, at any zoom/thickness.
  let lineLayout = computeVectorShaftLayout(origin, direction, length, LINE_HEAD_LENGTH)
  let tubeLayout = computeVectorShaftLayout(origin, direction, length, TUBE_HEAD_LENGTH)
  let ringedLayout = computeVectorShaftLayout(origin, direction, length, RINGED_HEAD_LENGTH)

  // Plain Line shaft
  const fatLineMat = new THREE.LineMaterial({ color: shaftColor, linewidth: LINE_SHAFT_PX, worldUnits: false })
  const fatLineGeom = new THREE.LineSegmentsGeometry()
  fatLineGeom.setPositions([origin.x, origin.y, origin.z, lineLayout.shaftEnd.x, lineLayout.shaftEnd.y, lineLayout.shaftEnd.z])
  const fatLine = new THREE.LineSegments2(fatLineGeom, fatLineMat)
  fatLine.userData.isFatLine = true
  fatLine.userData.fatLineBaseWidth = LINE_SHAFT_PX
  fatLine.userData.thickenGroup = 'vector'
  group.add(fatLine)

  // Plain Tube shaft
  const tubeMat = new THREE.MeshStandardMaterial({ color: shaftColor, roughness: 0.5, metalness: 0.1 })
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_SHAFT_RADIUS, TUBE_SHAFT_RADIUS, tubeLayout.shaftLength, 12), tubeMat)
  orient(tube, tubeLayout.shaftMid, direction, THREE)
  tube.userData.zoomInvariantRadius = TUBE_SHAFT_RADIUS
  tube.userData.thickenGroup = 'vector'
  group.add(tube)

  // Ringed Tube shaft
  const ringedTexture = makeRingTexture(THREE, bandA, bandB)
  setRingTextureRepeat(ringedTexture, ringedLayout.shaftLength, RINGED_RING_PERIOD)
  const ringedMat = new THREE.MeshStandardMaterial({
    map: ringedTexture,
    emissive: bandA,
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
  const coneLine = makeArrowhead(LINE_HEAD_RADIUS, LINE_HEAD_LENGTH, lineLayout.shaftEnd, new THREE.MeshLambertMaterial({ color: shaftColor }))
  const coneTube = makeArrowhead(TUBE_HEAD_RADIUS, TUBE_HEAD_LENGTH, tubeLayout.shaftEnd, new THREE.MeshStandardMaterial({ color: shaftColor, roughness: 0.4, metalness: 0.1 }))
  const coneRinged = makeArrowhead(RINGED_HEAD_RADIUS, RINGED_HEAD_LENGTH, ringedLayout.shaftEnd, new THREE.MeshStandardMaterial({ color: shaftColor, roughness: 0.4, metalness: 0.1 }))

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

  // Rescales the glyph to a new length in place, e.g. Vector Transform's
  // scalar-scale step -- rebuilds each style's shaft geometry (its length
  // changed) and repositions its cone (fixed length/radius, just moves to
  // the new shaftEnd). Kept as a userData method rather than callers
  // re-invoking buildVectorShaftGlyph so a rescale doesn't have to also
  // re-wire the settings subscription or replace the group in threeObjStore.
  group.userData.setVectorLength = (newLength) => {
    length = Math.max(0, newLength)
    lineLayout = computeVectorShaftLayout(origin, direction, length, LINE_HEAD_LENGTH)
    tubeLayout = computeVectorShaftLayout(origin, direction, length, TUBE_HEAD_LENGTH)
    ringedLayout = computeVectorShaftLayout(origin, direction, length, RINGED_HEAD_LENGTH)

    fatLineGeom.setPositions([origin.x, origin.y, origin.z, lineLayout.shaftEnd.x, lineLayout.shaftEnd.y, lineLayout.shaftEnd.z])

    tube.geometry.dispose()
    tube.geometry = new THREE.CylinderGeometry(TUBE_SHAFT_RADIUS, TUBE_SHAFT_RADIUS, tubeLayout.shaftLength, 12)
    orient(tube, tubeLayout.shaftMid, direction, THREE)

    ringedTube.geometry.dispose()
    ringedTube.geometry = new THREE.CylinderGeometry(
      RINGED_SHAFT_RADIUS,
      RINGED_SHAFT_RADIUS,
      ringedLayout.shaftLength,
      RINGED_RADIAL_SEGMENTS,
      RINGED_HEIGHT_SEGMENTS(ringedLayout.shaftLength)
    )
    orient(ringedTube, ringedLayout.shaftMid, direction, THREE)
    setRingTextureRepeat(ringedTexture, ringedLayout.shaftLength, RINGED_RING_PERIOD)

    orient(coneLine, lineLayout.shaftEnd, direction, THREE)
    orient(coneTube, tubeLayout.shaftEnd, direction, THREE)
    orient(coneRinged, ringedLayout.shaftEnd, direction, THREE)

    group.userData.vectorLength = length
  }
  group.userData.vectorOrigin = origin
  group.userData.vectorDirection = direction
  group.userData.vectorLength = length

  return group
}
