import useSettingsStore from '@/store/useSettingsStore'
import { LINE_STYLES } from '@/store/lineStyles'

// Every size below is an eyeballed per-style number, no formula.
// See docs/architecture/vector-line-glyphs.md#vector-shaft-glyph.

// Plain Line: a flat GL line (constant pixel width) with a flat 2D arrowhead
// (a single double-sided triangle) to match its unshaded look.
const LINE_SHAFT_PX = 4.6
const LINE_HEAD_HALF_WIDTH = 0.2
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

// Plain Line has no true 3D radius; its halo companion uses the same thin
// nominal size geoVectorLine.js picks for this style.
const HALO_PLAIN_LINE_NOMINAL_RADIUS = 0.035

// Defensive default only -- reached if `color` is omitted and GeoScratchColors
// isn't loaded.
const VECTOR_COLOR = 0x15803d

// The shaft stops `headLength` short of the true tip so the fixed-length cone
// reaches it. See docs/architecture/vector-line-glyphs.md#shaft-stops-short.
export function computeVectorShaftLayout(origin, direction, length, headLength) {
  const shaftLength = Math.max(length - headLength, MIN_SHAFT_LENGTH)
  const shaftMid = origin.clone().addScaledVector(direction, shaftLength / 2)
  const shaftEnd = origin.clone().addScaledVector(direction, shaftLength)
  return { shaftLength, shaftMid, shaftEnd }
}

// 2-color repeating texture, deliberately duplicated from geoVectorLine.js.
// See docs/architecture/vector-line-glyphs.md#vector-shaft-glyph.
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

// Ringed-tube band colors: +/- a lightness step from the base color.
function deriveRingBandColors(THREE, baseColor) {
  const hsl = {}
  new THREE.Color(baseColor).getHSL(hsl)
  const bandA = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.12)).getHex()
  const bandB = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.12)).getHex()
  return { bandA, bandB }
}

// `color` omitted -> colorSystem.js instance color, keyed by blockId (a
// suffixed id like "<id>_u" still gets a stable distinct color).
function resolveVectorColor(blockId, color) {
  if (color != null) return color
  const colors = typeof window !== 'undefined' ? window.GeoScratchColors : null
  return colors ? colors.forInstance('vector', blockId) : VECTOR_COLOR
}

// Builds a vector's shaft in all 3 styles + arrowhead cones, live-reacting to
// settings. Not shared with geoVectorLine.js.
// See docs/architecture/vector-line-glyphs.md#vector-shaft-glyph.
export function buildVectorShaftGlyph(THREE, blockId, origin, direction, length, color) {
  const group = new THREE.Group()
  const shaftColor = resolveVectorColor(blockId, color)
  const { bandA, bandB } = deriveRingBandColors(THREE, shaftColor)

  let lineLayout = computeVectorShaftLayout(origin, direction, length, LINE_HEAD_LENGTH)
  let tubeLayout = computeVectorShaftLayout(origin, direction, length, TUBE_HEAD_LENGTH)
  let ringedLayout = computeVectorShaftLayout(origin, direction, length, RINGED_HEAD_LENGTH)

  // Plain Line shaft
  const fatLineMat = new THREE.LineMaterial({
    color: shaftColor,
    linewidth: LINE_SHAFT_PX,
    worldUnits: false,
  })
  const fatLineGeom = new THREE.LineSegmentsGeometry()
  fatLineGeom.setPositions([
    origin.x,
    origin.y,
    origin.z,
    lineLayout.shaftEnd.x,
    lineLayout.shaftEnd.y,
    lineLayout.shaftEnd.z,
  ])
  const fatLine = new THREE.LineSegments2(fatLineGeom, fatLineMat)
  fatLine.userData.isFatLine = true
  fatLine.userData.fatLineBaseWidth = LINE_SHAFT_PX
  fatLine.userData.thickenGroup = 'vector'
  group.add(fatLine)

  // Plain Tube shaft
  const tubeMat = new THREE.MeshStandardMaterial({
    color: shaftColor,
    roughness: 0.5,
    metalness: 0.1,
  })
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_SHAFT_RADIUS, TUBE_SHAFT_RADIUS, tubeLayout.shaftLength, 12),
    tubeMat,
  )
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
      RINGED_HEIGHT_SEGMENTS(ringedLayout.shaftLength),
    ),
    ringedMat,
  )
  orient(ringedTube, ringedLayout.shaftMid, direction, THREE)
  ringedTube.userData.zoomInvariantRadius = RINGED_SHAFT_RADIUS
  ringedTube.userData.thickenGroup = 'vector'
  group.add(ringedTube)

  // Cones anchored at their BASE (fixed length, only radius zoom-scales).
  // See docs/architecture/vector-line-glyphs.md#cone-anchored-at-base.
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
  // Plain Line gets a FLAT head, not a cone: a single double-sided triangle,
  // unlit, matching the flat unshaded fat-line shaft. One blade, not crossed --
  // a "+" of two blades reads as confusing clutter to a newcomer.
  const makeFlatArrowhead = (halfWidth, headLength, shaftEnd, mat) => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, headLength, 0, -halfWidth, 0, 0, halfWidth, 0, 0], 3),
    )
    const mesh = new THREE.Mesh(geom, mat)
    mesh.userData.zoomInvariantRadius = halfWidth
    mesh.userData.thickenGroup = 'vector'
    orient(mesh, shaftEnd, direction, THREE)
    group.add(mesh)
    return mesh
  }
  const coneLineMat = new THREE.MeshBasicMaterial({ color: shaftColor, side: THREE.DoubleSide })
  const coneTubeMat = new THREE.MeshStandardMaterial({
    color: shaftColor,
    roughness: 0.4,
    metalness: 0.1,
  })
  const coneRingedMat = new THREE.MeshStandardMaterial({
    color: shaftColor,
    roughness: 0.4,
    metalness: 0.1,
  })
  const coneLine = makeFlatArrowhead(
    LINE_HEAD_HALF_WIDTH,
    LINE_HEAD_LENGTH,
    lineLayout.shaftEnd,
    coneLineMat,
  )
  const coneTube = makeArrowhead(
    TUBE_HEAD_RADIUS,
    TUBE_HEAD_LENGTH,
    tubeLayout.shaftEnd,
    coneTubeMat,
  )
  const coneRinged = makeArrowhead(
    RINGED_HEAD_RADIUS,
    RINGED_HEAD_LENGTH,
    ringedLayout.shaftEnd,
    coneRingedMat,
  )

  // Halo depth-trick: one inflated companion cylinder per style, spanning the
  // whole vector, so a vector crossing another vector (or a line) gets a clean
  // gap on the farther glyph -- resolved per-pixel by the halo passes, no
  // pairwise math. The Halos setting only gates NEW glyphs.
  // See docs/architecture/halos.md.
  const haloSettingEnabled = useSettingsStore?.getState().settings?.haloEnabled !== false
  const haloAvailable =
    haloSettingEnabled &&
    window.HALO_LAYER != null &&
    window.getHaloId &&
    window.createHaloIdMaterial &&
    window.applyHaloDiscardMaterial &&
    window.registerHaloLine &&
    window.HALO_MAX_IMMUNE_IDS != null
  const haloId = haloAvailable ? window.getHaloId(blockId) : null
  const haloImmuneIds = haloAvailable ? new Array(window.HALO_MAX_IMMUNE_IDS).fill(-1) : null
  if (haloAvailable) {
    // Registered as an infinite line through (origin, direction): a genuine 3D
    // touch (e.g. two vectors drawn from a shared tail) marks the pair mutually
    // immune, so there is no false gap where they actually meet.
    window.registerHaloLine(blockId, origin, direction, (partnerId) => {
      const slot = haloImmuneIds.indexOf(-1)
      if (slot !== -1) haloImmuneIds[slot] = partnerId
    })
  }

  const haloCompanionLength = () => Math.max(length, MIN_SHAFT_LENGTH)
  const buildHaloCompanion = (baseRadius) => {
    const radius = baseRadius + 0.01
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, haloCompanionLength(), 12),
      window.createHaloIdMaterial(haloId),
    )
    mesh.userData.zoomInvariantRadius = radius
    mesh.userData.thickenGroup = 'vector'
    orient(mesh, origin.clone().addScaledVector(direction, length / 2), direction, THREE)
    mesh.layers.set(window.HALO_LAYER)
    mesh.visible = false
    group.add(mesh)
    return mesh
  }
  const haloCompanionLine = haloAvailable
    ? buildHaloCompanion(HALO_PLAIN_LINE_NOMINAL_RADIUS)
    : null
  const haloCompanionTube = haloAvailable ? buildHaloCompanion(TUBE_SHAFT_RADIUS) : null
  const haloCompanionRinged = haloAvailable ? buildHaloCompanion(RINGED_SHAFT_RADIUS) : null
  if (haloAvailable) {
    for (const mat of [fatLineMat, tubeMat, ringedMat, coneLineMat, coneTubeMat, coneRingedMat]) {
      window.applyHaloDiscardMaterial(mat, haloId, haloImmuneIds)
    }
  }

  const applyVectorStyle = (settings) => {
    const activeStyle = settings.vectorStyle || LINE_STYLES.PLAIN_LINE
    fatLine.visible = coneLine.visible = activeStyle === LINE_STYLES.PLAIN_LINE
    tube.visible = coneTube.visible = activeStyle === LINE_STYLES.PLAIN_TUBE
    ringedTube.visible = coneRinged.visible = activeStyle === LINE_STYLES.RINGED_TUBE
    // Only the active style's companion on HALO_LAYER at once -- three
    // differently-sized footprints would fight in the depth prepass.
    if (haloAvailable) {
      haloCompanionLine.visible = activeStyle === LINE_STYLES.PLAIN_LINE
      haloCompanionTube.visible = activeStyle === LINE_STYLES.PLAIN_TUBE
      haloCompanionRinged.visible = activeStyle === LINE_STYLES.RINGED_TUBE
    }
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

  // Rescales in place (e.g. Vector Transform's scale step). A userData method
  // so a rescale needn't re-wire the subscription or replace the group.
  group.userData.setVectorLength = (newLength) => {
    length = Math.max(0, newLength)
    lineLayout = computeVectorShaftLayout(origin, direction, length, LINE_HEAD_LENGTH)
    tubeLayout = computeVectorShaftLayout(origin, direction, length, TUBE_HEAD_LENGTH)
    ringedLayout = computeVectorShaftLayout(origin, direction, length, RINGED_HEAD_LENGTH)

    fatLineGeom.setPositions([
      origin.x,
      origin.y,
      origin.z,
      lineLayout.shaftEnd.x,
      lineLayout.shaftEnd.y,
      lineLayout.shaftEnd.z,
    ])

    tube.geometry.dispose()
    tube.geometry = new THREE.CylinderGeometry(
      TUBE_SHAFT_RADIUS,
      TUBE_SHAFT_RADIUS,
      tubeLayout.shaftLength,
      12,
    )
    orient(tube, tubeLayout.shaftMid, direction, THREE)

    ringedTube.geometry.dispose()
    ringedTube.geometry = new THREE.CylinderGeometry(
      RINGED_SHAFT_RADIUS,
      RINGED_SHAFT_RADIUS,
      ringedLayout.shaftLength,
      RINGED_RADIAL_SEGMENTS,
      RINGED_HEIGHT_SEGMENTS(ringedLayout.shaftLength),
    )
    orient(ringedTube, ringedLayout.shaftMid, direction, THREE)
    setRingTextureRepeat(ringedTexture, ringedLayout.shaftLength, RINGED_RING_PERIOD)

    orient(coneLine, lineLayout.shaftEnd, direction, THREE)
    orient(coneTube, tubeLayout.shaftEnd, direction, THREE)
    orient(coneRinged, ringedLayout.shaftEnd, direction, THREE)

    for (const [companion, baseRadius] of [
      [haloCompanionLine, HALO_PLAIN_LINE_NOMINAL_RADIUS],
      [haloCompanionTube, TUBE_SHAFT_RADIUS],
      [haloCompanionRinged, RINGED_SHAFT_RADIUS],
    ]) {
      if (!companion) continue
      const radius = baseRadius + 0.01
      companion.geometry.dispose()
      companion.geometry = new THREE.CylinderGeometry(radius, radius, haloCompanionLength(), 12)
      orient(companion, origin.clone().addScaledVector(direction, length / 2), direction, THREE)
    }

    group.userData.vectorLength = length
  }
  group.userData.vectorOrigin = origin
  group.userData.vectorDirection = direction
  group.userData.vectorLength = length

  return group
}
