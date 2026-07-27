import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId) {
  // Pull variables securely from the active window runtime frame
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore

  if (!THREE) return null

  const getRawVector = (input) => {
    if (!input) return new THREE.Vector3()
    if (input.isVector3) return input.clone()
    if (input.isObject3D && input.userData?.direction) return input.userData.direction.clone()
    if (input.isObject3D && input.position) return input.position.clone()
    return new THREE.Vector3()
  }

  const origin = getRawVector(posInput)
  let direction = getRawVector(dirInput)
  if (!Number.isFinite(direction.length()) || direction.length() === 0) {
    direction = new THREE.Vector3(1, 0, 0)
  }

  const normalised = direction.clone().normalize()

  // Extend the line out to the walls of the 3D view's bounding box
  // (BoundingBoxRoom in Scene3D.jsx: a 40-unit cube centred on the world
  // origin, so half-extent 20) rather than a flat 20 units from the line's
  // own origin. A flat offset only actually reaches the wall when the line
  // passes through the world origin AND is axis-aligned -- any off-centre
  // origin falls short on one side (or shoots past the box) and any
  // non-axis-aligned direction falls short on both, since the true distance
  // to a face is 20 only along an axis and up to 20*sqrt(3) at a corner.
  const BOX_HALF_EXTENT = 20
  const FALLBACK_EXTENT = 20
  const rayBoxExitDistance = (rayOrigin, rayDir) => {
    let tExit = Infinity
    for (const axis of ['x', 'y', 'z']) {
      const d = rayDir[axis]
      if (Math.abs(d) < 1e-9) continue
      const boundary = d > 0 ? BOX_HALF_EXTENT : -BOX_HALF_EXTENT
      const t = (boundary - rayOrigin[axis]) / d
      if (t >= 0) tExit = Math.min(tExit, t)
    }
    return Number.isFinite(tExit) ? tExit : FALLBACK_EXTENT
  }
  const extentPos = rayBoxExitDistance(origin, normalised)
  const extentNeg = rayBoxExitDistance(origin, normalised.clone().negate())

  const p1 = origin.clone().addScaledVector(normalised, -extentNeg)
  const p2 = origin.clone().addScaledVector(normalised, extentPos)

  const group = new THREE.Group()

  // Two lines with the same origin/direction produce numerically coincident
  // geometry, which GPU depth testing resolves inconsistently frame-to-frame
  // (z-fighting flicker). Nudge the whole line by a tiny, deterministic
  // (per-block) offset perpendicular to its own direction -- small enough to
  // be visually imperceptible (well under the tube's own 0.051 radius) but
  // enough to break exact coincidence so depth comparisons stay stable.
  let blockHash = 2166136261
  const blockIdStr = String(blockId)
  for (let i = 0; i < blockIdStr.length; i += 1) {
    blockHash = (blockHash ^ blockIdStr.charCodeAt(i)) * 16777619 >>> 0
  }
  const jitterAngle = (blockHash % 360) * (Math.PI / 180)
  const jitterUp = Math.abs(normalised.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const jitterA = new THREE.Vector3().crossVectors(normalised, jitterUp).normalize()
  const jitterB = new THREE.Vector3().crossVectors(normalised, jitterA).normalize()
  const Z_FIGHT_JITTER = 0.0015
  group.position
    .addScaledVector(jitterA, Math.cos(jitterAngle) * Z_FIGHT_JITTER)
    .addScaledVector(jitterB, Math.sin(jitterAngle) * Z_FIGHT_JITTER)

  const distance = p1.distanceTo(p2)
  const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
  // Local tube frame is centred on the segment's midpoint, not the vector
  // equation's origin -- the two only coincide when extentPos === extentNeg.
  const halfDist = distance / 2

  // 1. TECHNIQUE STYLE: Plain Line
  const plainLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([p1, p2]),
    new THREE.LineBasicMaterial({ color: 0x374151 })
  )
  group.add(plainLine)

  // 1b. TECHNIQUE STYLE: Plain Line (thick). WebGL clamps LineBasicMaterial's
  // linewidth to 1px on most platforms (ANGLE on Windows, notably), so a
  // real solid-mesh line is the only way to make this style visibly
  // thicker. Built with three's "fat lines" (Line2/LineGeometry/LineMaterial)
  // rather than a cylinder: a cylinder is a real 3D solid, so its two ends
  // foreshorten independently whenever they're at different distances from
  // the camera (same reason a distant object looks smaller), which a literal
  // GL line never does -- it's a 0-width primitive the GPU always strokes to
  // a flat, constant-width screen-space band. LineMaterial's default
  // worldUnits:false mode reproduces exactly that: `linewidth` is a pixel
  // width applied per-point in screen space via the vertex shader, so this
  // reads as "a real GL line, just actually visible" at any zoom or angle,
  // rather than a thin 3D tube. Its resolution uniform and the "Extra Thick
  // Lines" pixel-width multiplier are kept in sync from Scene3D's
  // FatLineSync (geoVectorLineDefinition has no access to canvas size here).
  const PLAIN_LINE_THICK_BASE_PX = 2.2
  const plainLineThickGeom = new THREE.LineGeometry()
  plainLineThickGeom.setPositions([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z])
  const plainLineThickMat = new THREE.LineMaterial({
    color: 0x374151,
    linewidth: PLAIN_LINE_THICK_BASE_PX,
    worldUnits: false,
  })
  const plainLineThick = new THREE.Line2(plainLineThickGeom, plainLineThickMat)
  plainLineThick.userData.isFatLine = true
  plainLineThick.userData.fatLineBaseWidth = PLAIN_LINE_THICK_BASE_PX
  group.add(plainLineThick)

  // 2. TECHNIQUE STYLE: True Illuminated Line (Zöckler et al. Implementation)
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const lineDirections = new Float32Array([
    normalised.x, normalised.y, normalised.z,
    normalised.x, normalised.y, normalised.z
  ]);
  lineGeometry.setAttribute('lineDir', new THREE.BufferAttribute(lineDirections, 3));

  const illumMaterial = new THREE.ShaderMaterial({
    uniforms: {
      lightPosition: { value: new THREE.Vector3(5, 10, 7).normalize() },
      ambientColor: { value: new THREE.Color(0x222222) },
      diffuseColor: { value: new THREE.Color(0x4b5563) },
      specularColor: { value: new THREE.Color(0xffffff) },
      shininess: { value: 32.0 }
    },
    vertexShader: `
      attribute vec3 lineDir;
      varying vec3 vLineDir;
      varying vec3 vViewPosition;

      void main() {
        vLineDir = normalize(normalMatrix * lineDir);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lightPosition;
      uniform vec3 ambientColor;
      uniform vec3 diffuseColor;
      uniform vec3 specularColor;
      uniform float shininess;

      varying vec3 vLineDir;
      varying vec3 vViewPosition;

      void main() {
        vec3 T = normalize(vLineDir);
        vec3 L = normalize(lightPosition);
        vec3 V = normalize(vViewPosition);

        float dotTL = dot(T, L);
        float diffuseIntensity = sqrt(max(0.0, 1.0 - dotTL * dotTL));

        float dotTV = dot(T, V);
        float specularIntensity = 0.0;
        if (diffuseIntensity > 0.0) {
          float specTerm = dotTL * dotTV + diffuseIntensity * sqrt(max(0.0, 1.0 - dotTV * dotTV));
          specularIntensity = pow(max(0.0, specTerm), shininess);
        }

        vec3 finalColor = ambientColor + (diffuseColor * diffuseIntensity) + (specularColor * specularIntensity);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });

  const illumLine = new THREE.Line(lineGeometry, illumMaterial)
  group.add(illumLine)

  // 2b. TECHNIQUE STYLE: Illuminated Line (thick). A real MeshStandardMaterial
  // cylinder here would depend on actual scene lights hitting it -- at this
  // radius, with only ambient + a couple of point lights, most of its
  // surface reads as dim/subtle instead of the bright, consistently-lit look
  // the hairline version guarantees. So this reuses the SAME shader/material
  // as the hairline illumLine (its lighting is synthetic, based only on the
  // tangent direction, never scene lights or real surface normals) applied
  // to cylinder geometry instead of a flat line, rather than trying to get
  // real lighting to behave the same way.
  const illumThickGeom = new THREE.CylinderGeometry(0.0272, 0.0272, distance, 12)
  const illumThickVertexCount = illumThickGeom.attributes.position.count
  const illumThickLineDirs = new Float32Array(illumThickVertexCount * 3)
  // Expressed in the cylinder's own local frame, where its canonical up-axis
  // (0,1,0) *is* the tangent direction -- the quaternion below then carries
  // that (already-correct) local tangent out to world space along with
  // everything else, the same way cylinder/ringedTube orient themselves.
  // Using `normalised` (a group-frame vector) here instead would be wrong:
  // the shader's normalMatrix already applies this mesh's own rotation, so
  // a group-frame vector would get rotated a second time.
  for (let i = 0; i < illumThickVertexCount; i += 1) {
    illumThickLineDirs[i * 3] = 0
    illumThickLineDirs[i * 3 + 1] = 1
    illumThickLineDirs[i * 3 + 2] = 0
  }
  illumThickGeom.setAttribute('lineDir', new THREE.BufferAttribute(illumThickLineDirs, 3))

  const illumLineThick = new THREE.Mesh(illumThickGeom, illumMaterial)
  illumLineThick.userData.zoomInvariantRadius = 0.0272
  illumLineThick.position.copy(midPoint)
  illumLineThick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(illumLineThick)

  // 3. TECHNIQUE STYLE: Plain Tube (Cylinder). MeshStandardMaterial (not
  // MeshBasicMaterial) so it actually picks up the scene's lights and shows
  // a real shaded gradient across its curved surface, same as every other
  // solid in the scene (sphere/teapot/cube, ringedTube's base tube).
  const cylGeom = new THREE.CylinderGeometry(0.051, 0.051, distance, 12)
  const cylMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.1 })
  const cylinder = new THREE.Mesh(cylGeom, cylMat)
  cylinder.userData.zoomInvariantRadius = 0.051
  cylinder.position.copy(midPoint)
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(cylinder)

  // 4. TECHNIQUE STYLE: Ringed Tube
  const ringedTube = new THREE.Group()

  const baseTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, distance, 16),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.4 })
  )
  baseTube.userData.zoomInvariantRadius = 0.085
  ringedTube.add(baseTube)

  const ringGeom = new THREE.CylinderGeometry(0.0952, 0.0952, 0.15, 16)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.3 })

  const step = 0.3

  for (let y = -halfDist; y <= halfDist; y += step) {
    const ringSegment = new THREE.Mesh(ringGeom, ringMat)
    ringSegment.userData.zoomInvariantRadius = 0.0952
    ringSegment.position.set(0, y, 0)
    ringedTube.add(ringSegment)
  }

  const capGeom = new THREE.SphereGeometry(0.1088, 16, 16)
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.2 })

  const topCap = new THREE.Mesh(capGeom, capMat)
  topCap.userData.zoomInvariantRadius = 0.1088
  topCap.userData.zoomInvariantUniform = true
  topCap.position.set(0, halfDist, 0)
  ringedTube.add(topCap)

  const bottomCap = new THREE.Mesh(capGeom, capMat)
  bottomCap.userData.zoomInvariantRadius = 0.1088
  bottomCap.userData.zoomInvariantUniform = true
  bottomCap.position.set(0, -halfDist, 0)
  ringedTube.add(bottomCap)

  ringedTube.position.copy(midPoint)
  ringedTube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(ringedTube)

  // 5. COLLISION ACCENTS: how this line's tube indicates the exact
  // stretch(es) where it passes into a solid object -- laid over/instead of
  // the plain-tube shaft (radius 0.051), not a whole-line style swap.
  // Line-vs-line overlap is handled separately (as a halo, not a collision
  // accent). Three interchangeable looks, picked via
  // settings.lineCollisionStyle. All three live in the same local frame as
  // cylinder/ringedTube (Y axis along the line, origin at y=0), so a zone
  // {start, end} from tubeCollision.js maps directly onto local y positions
  // in each.

  // 5a. "ringed": dark corrugation rings overlaid on top of the always-
  // visible base tube. Sized close to the shaft's own radius so it reads as
  // a textured band rather than a separate object bulging off it.
  const collisionAccentRinged = new THREE.Group()
  collisionAccentRinged.position.copy(midPoint)
  collisionAccentRinged.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  collisionAccentRinged.visible = false
  group.add(collisionAccentRinged)

  const COLLISION_RING_HEIGHT = 0.09
  const COLLISION_RING_HALF_HEIGHT = COLLISION_RING_HEIGHT / 2
  const collisionRingGeom = new THREE.CylinderGeometry(0.068, 0.068, COLLISION_RING_HEIGHT, 16)
  const collisionRingMat = new THREE.MeshStandardMaterial({
    color: 0x3f3f46,
    roughness: 0.65,
    metalness: 0.15,
  })
  const COLLISION_RING_STEP = 0.16

  // 5b. "dark_texture": a single darker, rougher solid segment overlaid on
  // top of the base tube -- no rings, no gaps, just a dimmed band.
  const collisionAccentDarkTexture = new THREE.Group()
  collisionAccentDarkTexture.position.copy(midPoint)
  collisionAccentDarkTexture.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  collisionAccentDarkTexture.visible = false
  group.add(collisionAccentDarkTexture)

  const darkTextureMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.85,
    metalness: 0.05,
  })

  // 5c. "dashed": REPLACES the base tube (rather than overlaying it) with
  // alternating dash/gap segments across collision zones, so the solid
  // actually shows through the gaps instead of the continuous tube covering
  // them. Outside any zone the tube stays one continuous solid piece.
  const dashedTubeGroup = new THREE.Group()
  dashedTubeGroup.position.copy(midPoint)
  dashedTubeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  dashedTubeGroup.visible = false
  group.add(dashedTubeGroup)

  const DASHED_SEGMENT_LENGTH = 0.14
  const DASHED_GAP_LENGTH = 0.09
  // Same shaded material as the continuous plain tube (cylMat) -- the
  // dashed segments are that same glyph, just chopped up, so they shouldn't
  // suddenly look flat/unlit when the dashed collision style is active.
  const dashedTubeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.1 })

  const addTubeSegment = (targetGroup, material, radius, start, end) => {
    const height = end - start
    if (height <= 1e-6) return
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material)
    segment.userData.zoomInvariantRadius = radius
    segment.position.set(0, (start + end) / 2, 0)
    targetGroup.add(segment)
  }

  group.userData.hasCollisionAccent = false
  group.userData.setCollisionZones = (zones = []) => {
    while (collisionAccentRinged.children.length) collisionAccentRinged.remove(collisionAccentRinged.children[0])
    while (collisionAccentDarkTexture.children.length) collisionAccentDarkTexture.remove(collisionAccentDarkTexture.children[0])
    while (dashedTubeGroup.children.length) dashedTubeGroup.remove(dashedTubeGroup.children[0])

    zones.forEach(({ start, end }) => {
      // A ring's CENTER sitting exactly at the zone boundary still pokes its
      // own half-height past it (a real cylinder, not a point) -- so the
      // usable placement range has to be inset by the ring's half-height on
      // each side for its actual body to stay within [start, end].
      const usableStart = start + COLLISION_RING_HALF_HEIGHT
      const usableEnd = end - COLLISION_RING_HALF_HEIGHT
      if (usableStart > usableEnd) {
        if (end > start) {
          const ringSegment = new THREE.Mesh(collisionRingGeom, collisionRingMat)
          ringSegment.userData.zoomInvariantRadius = 0.068
          ringSegment.position.set(0, (start + end) / 2, 0)
          collisionAccentRinged.add(ringSegment)
        }
        return
      }
      // Stepping from usableStart only ever leaves leftover room on the far
      // (usableEnd) side, since the zone width is rarely an exact multiple
      // of the step -- that leftover always landing on one side is what
      // made the accent look closer to one edge than the other. Centering
      // the whole ring sequence within [usableStart, usableEnd] splits that
      // leftover evenly instead, without changing ring size, spacing, or
      // the zone's own length.
      const usableRange = usableEnd - usableStart
      const ringCount = Math.floor(usableRange / COLLISION_RING_STEP) + 1
      const coveredSpan = (ringCount - 1) * COLLISION_RING_STEP
      const firstY = usableStart + (usableRange - coveredSpan) / 2
      for (let i = 0; i < ringCount; i += 1) {
        const ringSegment = new THREE.Mesh(collisionRingGeom, collisionRingMat)
        ringSegment.userData.zoomInvariantRadius = 0.068
        ringSegment.position.set(0, firstY + i * COLLISION_RING_STEP, 0)
        collisionAccentRinged.add(ringSegment)
      }
    })

    zones.forEach(({ start, end }) => {
      addTubeSegment(collisionAccentDarkTexture, darkTextureMat, 0.068, start, end)
    })

    // Walk the whole tube length once, emitting solid pieces for the
    // stretches outside any zone and a dash/gap pattern for the stretches
    // inside one.
    let cursor = -halfDist
    zones.forEach(({ start, end }) => {
      const zoneStart = Math.max(-halfDist, start)
      const zoneEnd = Math.min(halfDist, end)
      if (zoneStart > cursor) addTubeSegment(dashedTubeGroup, dashedTubeMat, 0.051, cursor, zoneStart)

      let y = zoneStart
      let dashOn = true
      while (y < zoneEnd - 1e-6) {
        const segEnd = Math.min(zoneEnd, y + (dashOn ? DASHED_SEGMENT_LENGTH : DASHED_GAP_LENGTH))
        if (dashOn) addTubeSegment(dashedTubeGroup, dashedTubeMat, 0.051, y, segEnd)
        y = segEnd
        dashOn = !dashOn
      }
      cursor = zoneEnd
    })
    if (cursor < halfDist) addTubeSegment(dashedTubeGroup, dashedTubeMat, 0.051, cursor, halfDist)

    group.userData.hasCollisionAccent = zones.length > 0
    group.userData.refreshGlyph?.()
  }

  const applyGlyphVisibility = (settings) => {
    const activeStyle = settings.lineStyle || 'plain_line'
    const collisionStyle = settings.lineCollisionStyle || 'ringed'
    const thick = !!settings.thickLinePrimitives
    const isPlainTube = activeStyle === 'plain_tube'
    // Ringed_tube already looks ringed everywhere, so accents only add value
    // layered on (or, for "dashed", swapped in for) the plain tube.
    const hasAccent = isPlainTube && group.userData.hasCollisionAccent
    const useDashedReplacement = hasAccent && collisionStyle === 'dashed'

    plainLine.visible = activeStyle === 'plain_line' && !thick
    plainLineThick.visible = activeStyle === 'plain_line' && thick
    illumLine.visible = activeStyle === 'illuminated_line' && !thick
    illumLineThick.visible = activeStyle === 'illuminated_line' && thick
    // The dashed collision style fully replaces the plain-tube glyph (real
    // gaps instead of an overlay), so hide the continuous base tube while
    // it's active.
    cylinder.visible = isPlainTube && !useDashedReplacement
    ringedTube.visible = activeStyle === 'ringed_tube'

    dashedTubeGroup.visible = useDashedReplacement
    collisionAccentRinged.visible = hasAccent && collisionStyle === 'ringed'
    collisionAccentDarkTexture.visible = hasAccent && collisionStyle === 'dark_texture'
  }

  // Lets an external pass (tubeCollision.js) re-apply visibility after
  // calling setCollisionZones(), without duplicating the style lookup.
  group.userData.refreshGlyph = () => {
    const settings = useSettingsStore?.getState().settings || {}
    applyGlyphVisibility(settings)
  }

  // FIXED: Look up configurations out of useSettingsStore safely
  const currentSettings = useSettingsStore?.getState().settings || {}
  applyGlyphVisibility(currentSettings)

  // FIXED: Attach live reactive change subscription handlers targeting the correct store identifier
  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== group) {
        unsubscribe()
        return
      }
      applyGlyphVisibility(state.settings)
    })
  }

  const sphereGeom = new THREE.SphereGeometry(0.04, 16, 12)
  const originSphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.1 })
  )
  originSphere.userData.zoomInvariantRadius = 0.04
  originSphere.userData.zoomInvariantUniform = true
  originSphere.position.copy(origin)
  group.add(originSphere)

  if (typeof tRaw !== 'undefined' && Number.isFinite(Number(tRaw))) {
    const tVal = Number(tRaw)
    const rPoint = origin.clone().addScaledVector(direction, tVal)
    const tSphere = new THREE.Mesh(
      sphereGeom,
      new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
    )
    tSphere.userData.zoomInvariantRadius = 0.04
    tSphere.userData.zoomInvariantUniform = true
    tSphere.position.copy(rPoint)
    group.add(tSphere)
    group.userData.t = tVal
    group.userData.rPoint = rPoint.clone()
  } else {
    group.userData.t = undefined
    group.userData.rPoint = undefined
  }

  group.userData.geoType = 'geo_vector_line'
  group.userData.origin = origin.clone()
  group.userData.direction = direction.clone()
  // Consumed by tubeCollision.js's worldSegment(), which needs the same
  // centre/half-length the tube's own local geometry is built around (the
  // segment midpoint), not the vector equation's origin -- see the
  // extentPos/extentNeg comment above for why those two points can differ.
  group.userData.segmentMid = midPoint.clone()
  group.userData.segmentHalfLength = halfDist
  group.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export function initVector3Block() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_vector = {
    init() {
      this.appendDummyInput().appendField('Vector Equation of Line')
      this.appendValueInput('POS').appendField('Position:').setCheck('vector3')
      this.appendValueInput('DIR').appendField('Direction:').setCheck('vector3')
      this.appendValueInput('SCALE').appendField('t:').setCheck('scalar')
      this.setTooltip('A line in R3 that passes through a specific point and runs parallel to the direction vector')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
    },
  }

  javascriptGenerator.forBlock.geo_vector = function(block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''

    const vecPos = valueToCode('POS') || 'new window.THREE.Vector3()'
    const vecDir = valueToCode('DIR') || 'new window.THREE.Vector3(1,0,0)'

    const scaleInput = block.getInput('SCALE')
    const hasScaleInput = !!(scaleInput?.connection?.targetConnection)
    const vecScaleCode = hasScaleInput ? (valueToCode('SCALE') || '0') : 'undefined'

    const blockId = JSON.stringify(block.id)

    // FIXED: Cleaned parameters up to leverage our isolated window scope injection securely
    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId})`

    return [code, Order.FUNCTION_CALL]
  }
}
