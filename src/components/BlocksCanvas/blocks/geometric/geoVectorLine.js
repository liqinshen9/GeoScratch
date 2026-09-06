import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'
import { forInstance } from '@/store/colorSystem'
import { FieldObjectName } from '@/components/BlocksCanvas/blocks/naming/FieldObjectName'

// ===================
// 1. RUNTIME THREE.JS
// ===================
// Both .toString()-serialized into generated code AND called directly by
// generateAndRun.js to rebuild a transformed line. See
// docs/architecture/vector-line-glyphs.md.
export function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId) {
  // Pull variables securely from the active window runtime frame
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore

  if (!THREE) return null

  // This instance's colors from the shared framework (colorSystem.js): the
  // "Line" family + light/dark variants for the ringed texture, "Point" for
  // the t-marker.
  const colorInt = (hex) => parseInt(hex.slice(1), 16)
  const lineColor = window.GeoScratchColors.forInstance('line', blockId)
  const lineColorLight = window.GeoScratchColors.forInstanceVariant('line', blockId, 28)
  const lineColorDark = window.GeoScratchColors.forInstanceVariant('line', blockId, -14)
  const pointColor = window.GeoScratchColors.forInstanceVariant('point', blockId, 24)
  let tSphereRef = null

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
    // Not axis-aligned -- see docs/architecture/vector-line-glyphs.md#default-direction.
    direction = new THREE.Vector3(1, 1, 1)
  }

  const normalised = direction.clone().normalize()

  // Line-vs-AABB slab clip to the 40-unit view box.
  // See docs/architecture/vector-line-glyphs.md#line-vs-box-clipping.
  const BOX_HALF_EXTENT = 20
  const FALLBACK_EXTENT = 20
  const lineBoxInterval = (rayOrigin, rayDir) => {
    let tEnter = -Infinity
    let tExit = Infinity
    for (const axis of ['x', 'y', 'z']) {
      const o = rayOrigin[axis]
      const d = rayDir[axis]
      if (Math.abs(d) < 1e-9) {
        // Parallel to this face pair -- no intersection if outside them.
        if (o < -BOX_HALF_EXTENT || o > BOX_HALF_EXTENT) return null
        continue
      }
      let tNear = (-BOX_HALF_EXTENT - o) / d
      let tFar = (BOX_HALF_EXTENT - o) / d
      if (tNear > tFar) [tNear, tFar] = [tFar, tNear]
      tEnter = Math.max(tEnter, tNear)
      tExit = Math.min(tExit, tFar)
    }
    if (!Number.isFinite(tEnter) || !Number.isFinite(tExit) || tExit < tEnter) return null
    return [tEnter, tExit]
  }
  const [tEnter, tExit] = lineBoxInterval(origin, normalised) || [-FALLBACK_EXTENT, FALLBACK_EXTENT]

  const p1 = origin.clone().addScaledVector(normalised, tEnter)
  const p2 = origin.clone().addScaledVector(normalised, tExit)

  const group = new THREE.Group()

  // Tiny deterministic per-block perpendicular nudge to break exact
  // coincidence between two identical lines (z-fighting flicker).
  // See docs/architecture/vector-line-glyphs.md#z-fight-jitter.
  let blockHash = 2166136261
  const blockIdStr = String(blockId)
  for (let i = 0; i < blockIdStr.length; i += 1) {
    blockHash = ((blockHash ^ blockIdStr.charCodeAt(i)) * 16777619) >>> 0
  }
  const jitterAngle = (blockHash % 360) * (Math.PI / 180)
  const jitterUp =
    Math.abs(normalised.y) < 0.999 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const jitterA = new THREE.Vector3().crossVectors(normalised, jitterUp).normalize()
  const jitterB = new THREE.Vector3().crossVectors(normalised, jitterA).normalize()
  const Z_FIGHT_JITTER = 0.0015
  group.position
    .addScaledVector(jitterA, Math.cos(jitterAngle) * Z_FIGHT_JITTER)
    .addScaledVector(jitterB, Math.sin(jitterAngle) * Z_FIGHT_JITTER)

  const distance = p1.distanceTo(p2)
  const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
  const lineLabel = window.geoNaming?.nameFor?.(blockId) || 'L'
  // Local frame centred on the segment midpoint, not the equation origin.
  // See docs/architecture/vector-line-glyphs.md#line-vs-box-clipping.
  const halfDist = distance / 2
  const worldAt = (y) => midPoint.clone().addScaledVector(normalised, y)

  // Shared dash pattern for the "dashed" collision style.
  // See docs/architecture/vector-line-glyphs.md#segment-and-dash-machinery.
  const DASHED_SEGMENT_LENGTH = 0.14
  const DASHED_GAP_LENGTH = 0.09
  let currentZones = []

  // y-ranges to draw, each tagged isDash (bump) or not (solid stretch).
  // See docs/architecture/vector-line-glyphs.md#segment-and-dash-machinery.
  const computeSegmentPairs = (
    zones,
    dashed,
    dashLen = DASHED_SEGMENT_LENGTH,
    gapLen = DASHED_GAP_LENGTH,
  ) => {
    if (!dashed || zones.length === 0) return [{ start: -halfDist, end: halfDist, isDash: false }]
    const pairs = []
    let cursor = -halfDist
    zones.forEach(({ start, end }) => {
      const zoneStart = Math.max(-halfDist, start)
      const zoneEnd = Math.min(halfDist, end)
      if (zoneStart > cursor) pairs.push({ start: cursor, end: zoneStart, isDash: false })
      let y = zoneStart
      let dashOn = true
      while (y < zoneEnd - 1e-6) {
        const segEnd = Math.min(zoneEnd, y + (dashOn ? dashLen : gapLen))
        if (dashOn && segEnd > y) pairs.push({ start: y, end: segEnd, isDash: true })
        y = segEnd
        dashOn = !dashOn
      }
      cursor = zoneEnd
    })
    if (cursor < halfDist) pairs.push({ start: cursor, end: halfDist, isDash: false })
    return pairs
  }

  // MUST .dispose() -- .remove() alone leaks GPU resources, and rebuilds
  // fire many times a second during a fast zoom. disposeMaterial is false
  // for segments sharing a persistent material.
  // See docs/architecture/vector-line-glyphs.md#dispose-on-rebuild.
  const clearGroupChildren = (targetGroup, disposeMaterial) => {
    while (targetGroup.children.length) {
      const child = targetGroup.children[0]
      targetGroup.remove(child)
      child.geometry?.dispose()
      if (disposeMaterial && child.material) {
        child.material.map?.dispose()
        child.material.dispose()
      }
    }
  }

  // Haloed-line GPU depth-trick. Per-style inflated companion meshes; the
  // Halos setting only gates NEW lines. See docs/architecture/halos.md and
  // docs/architecture/vector-line-glyphs.md#halo-companions.
  const haloSettingEnabled = useSettingsStore?.getState().settings?.haloEnabled !== false
  const haloAvailable =
    haloSettingEnabled &&
    window.HALO_LAYER != null &&
    window.getHaloId &&
    window.createHaloIdMaterial &&
    window.applyHaloDiscardMaterial &&
    window.registerHaloLine &&
    window.HALO_MAX_IMMUNE_IDS != null
  // One haloId per line, shared by every material that can be the visible glyph.
  const haloId = haloAvailable ? window.getHaloId(blockId) : null
  // Ids of lines THIS one genuinely touches in 3D, exempt from the discard
  // check. Shared array, mutated by registerHaloLine.
  // See docs/architecture/halos.md.
  const haloImmuneIds = haloAvailable ? new Array(window.HALO_MAX_IMMUNE_IDS).fill(-1) : null
  if (haloAvailable) {
    window.registerHaloLine(blockId, origin, normalised, (partnerId) => {
      const slot = haloImmuneIds.indexOf(-1)
      if (slot !== -1) haloImmuneIds[slot] = partnerId
    })
  }

  // One inflated companion per style (baseRadius + 0.01). Only the active
  // style's is visible at once. See docs/architecture/vector-line-glyphs.md#halo-companions.
  const buildHaloCompanion = (baseRadius) => {
    const radius = baseRadius + 0.01
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, distance, 12),
      window.createHaloIdMaterial(haloId),
    )
    mesh.userData.zoomInvariantRadius = radius
    mesh.position.copy(midPoint)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
    mesh.layers.set(window.HALO_LAYER)
    mesh.visible = false
    group.add(mesh)
    return mesh
  }

  // 1. TECHNIQUE STYLE: Plain Line. Three's "fat lines" (screen-space
  // stroked), not a cylinder; one LineSegments2 per pair (multi-instance
  // geometry silently drops instances).
  // See docs/architecture/vector-line-glyphs.md#plain_line.
  const PLAIN_LINE_THICK_BASE_PX = 2.2
  const plainLineThickMat = new THREE.LineMaterial({
    color: lineColor,
    linewidth: PLAIN_LINE_THICK_BASE_PX,
    worldUnits: false,
  })
  const plainLineThickGroup = new THREE.Group()
  group.add(plainLineThickGroup)

  // No true 3D radius -- companion uses the same thin nominal size as the
  // accent overlay for this style.
  const haloCompanionPlainLine = haloAvailable ? buildHaloCompanion(0.035) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(plainLineThickMat, haloId, haloImmuneIds)

  // Shares plain_tube's THICK_DASHED_* sizing. One LineSegments2 per pair.
  const setThickLineSegmentPairs = (pairs) => {
    clearGroupChildren(plainLineThickGroup, false) // shares plainLineThickMat
    pairs.forEach((pair) => {
      const a = worldAt(pair.start)
      const b = worldAt(pair.end)
      const geom = new THREE.LineSegmentsGeometry()
      geom.setPositions([a.x, a.y, a.z, b.x, b.y, b.z])
      const seg = new THREE.LineSegments2(geom, plainLineThickMat)
      seg.userData.isFatLine = true
      seg.userData.fatLineBaseWidth = PLAIN_LINE_THICK_BASE_PX
      plainLineThickGroup.add(seg)
    })
  }
  setThickLineSegmentPairs([{ start: -halfDist, end: halfDist, isDash: false }])

  // 2. TECHNIQUE STYLE: Plain Tube. MeshStandardMaterial so it picks up
  // scene lights like every other solid.
  const cylGeom = new THREE.CylinderGeometry(0.051, 0.051, distance, 12)
  const cylMat = new THREE.MeshStandardMaterial({
    color: lineColor,
    roughness: 0.5,
    metalness: 0.1,
  })
  const cylinder = new THREE.Mesh(cylGeom, cylMat)
  cylinder.userData.zoomInvariantRadius = 0.051
  cylinder.position.copy(midPoint)
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(cylinder)

  const haloCompanionPlainTube = haloAvailable ? buildHaloCompanion(0.051) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(cylMat, haloId, haloImmuneIds)

  // "dashed" collision style: REPLACES the base cylinder with solid/gap
  // segments across collision zones (solid shows through the gaps).
  const dashedTubeGroup = new THREE.Group()
  dashedTubeGroup.position.copy(midPoint)
  dashedTubeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  dashedTubeGroup.visible = false
  group.add(dashedTubeGroup)

  // Same shading as cylMat, but a SEPARATE material -- it must be wired
  // through the discard shader too.
  // See docs/architecture/vector-line-glyphs.md#discard-shader-asymmetry.
  const dashedTubeMat = new THREE.MeshStandardMaterial({
    color: lineColor,
    roughness: 0.5,
    metalness: 0.1,
  })
  if (haloAvailable) window.applyHaloDiscardMaterial(dashedTubeMat, haloId, haloImmuneIds)

  // "Fewer, larger dashes", shared by plain_tube and plain_line-thick. NOT
  // per-segment zoom-invariant -- DashZoomSync scales the length instead,
  // which is what makes the dash count respond to zoom.
  // See docs/architecture/vector-line-glyphs.md#dash-length-vs-count.
  const THICK_DASHED_SEGMENT_LENGTH = 0.45
  const THICK_DASHED_GAP_LENGTH = 0.3

  // `uniform` = a discrete bump, scaled apparent-size-constant in every dimension.
  const addTubeSegment = (targetGroup, material, radius, start, end, uniform) => {
    const height = end - start
    if (height <= 1e-6) return
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material)
    segment.userData.zoomInvariantRadius = radius
    if (uniform) segment.userData.zoomInvariantUniform = true
    segment.position.set(0, (start + end) / 2, 0)
    targetGroup.add(segment)
  }

  // "accent" role color (colorPresets.js), recolored by a preset switch.
  const RING_ACCENT_COLOR = colorInt(window.GeoScratchColors.forRole('accent'))

  // A repeating 2-band texture instead of many ring meshes -- can't bulge,
  // and zoom response is one texture.repeat.y write with no rebuild flicker.
  // colorB null = transparent second band (accent overlay).
  // See docs/architecture/vector-line-glyphs.md#ringed_tube.
  const makeRingTexture = (colorA, colorB) => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    const hex = (c) => '#' + c.toString(16).padStart(6, '0')
    ctx.fillStyle = hex(colorA)
    ctx.fillRect(0, 0, 4, 32)
    if (colorB !== null) {
      ctx.fillStyle = hex(colorB)
      ctx.fillRect(0, 32, 4, 32)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    // NearestFilter + high anisotropy for hard-edged stripes.
    // See docs/architecture/vector-line-glyphs.md#ring-texture-filtering.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 16
    return texture
  }
  // Shared ring-texture repeat calc so every ring-textured glyph resizes the
  // same way.
  const setRingTextureRepeat = (texture, length, period, scale) => {
    texture.repeat.set(1, length / (period * scale))
  }

  // 3. TECHNIQUE STYLE: Ringed Tube
  const ringedTube = new THREE.Group()

  // Fixed at build time -- ring band frequency is NOT zoom-responsive, so no
  // texture rebuild races the cross-section's zoom-invariant scaling.
  const RINGED_TUBE_RING_PERIOD = 0.8

  // Real height segments (~one per ring) keep every triangle short. This is
  // the fix for the torn ring texture, NOT the ring size/count.
  // See docs/architecture/vector-line-glyphs.md#needle-triangle.
  const RINGED_TUBE_HEIGHT_SEGMENTS = (length) =>
    Math.max(1, Math.ceil(length / RINGED_TUBE_RING_PERIOD) * 2)
  // More radial segments + higher roughness shrink the per-facet specular
  // step that otherwise reads as a jagged cut on a band edge.
  const RINGED_TUBE_RADIAL_SEGMENTS = 48
  const RINGED_TUBE_ROUGHNESS = 0.75
  // Deliberately NOT transparent -- transparent:true breaks depth-tested
  // occlusion. See docs/architecture/vector-line-glyphs.md#ringed-tube-opaque.
  const RINGED_TUBE_EMISSIVE_COLOR = 0x71717a
  const RINGED_TUBE_EMISSIVE_INTENSITY = 0.2
  const RINGED_TUBE_METALNESS = 0.15
  const ringedTubeTexture = makeRingTexture(colorInt(lineColorLight), colorInt(lineColorDark))
  setRingTextureRepeat(ringedTubeTexture, distance, RINGED_TUBE_RING_PERIOD, 1)
  const ringedTubeMat = new THREE.MeshStandardMaterial({
    map: ringedTubeTexture,
    emissive: RINGED_TUBE_EMISSIVE_COLOR,
    emissiveIntensity: RINGED_TUBE_EMISSIVE_INTENSITY,
    roughness: RINGED_TUBE_ROUGHNESS,
    metalness: RINGED_TUBE_METALNESS,
  })

  const baseTube = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.085,
      0.085,
      distance,
      RINGED_TUBE_RADIAL_SEGMENTS,
      RINGED_TUBE_HEIGHT_SEGMENTS(distance),
    ),
    ringedTubeMat,
  )
  baseTube.userData.zoomInvariantRadius = 0.085
  ringedTube.add(baseTube)

  const haloCompanionRingedTube = haloAvailable ? buildHaloCompanion(0.085) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(ringedTubeMat, haloId, haloImmuneIds)

  // "dashed" style REPLACES the base tube, like plain_tube's dashedTubeGroup;
  // ring texture cloned per segment for a correctly-scaled repeat.
  const ringedTubeDashedGroup = new THREE.Group()
  ringedTubeDashedGroup.visible = false
  ringedTube.add(ringedTubeDashedGroup)
  const addRingedTubeDashSegment = (start, end) => {
    const height = end - start
    if (height <= 1e-6) return
    const tex = ringedTubeTexture.clone()
    tex.needsUpdate = true
    setRingTextureRepeat(tex, height, RINGED_TUBE_RING_PERIOD, 1)
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: RINGED_TUBE_EMISSIVE_COLOR,
      emissiveIntensity: RINGED_TUBE_EMISSIVE_INTENSITY,
      roughness: RINGED_TUBE_ROUGHNESS,
      metalness: RINGED_TUBE_METALNESS,
    })
    // Fresh material per call -- needs its own discard wiring.
    // See docs/architecture/vector-line-glyphs.md#discard-shader-asymmetry.
    if (haloAvailable) window.applyHaloDiscardMaterial(mat, haloId, haloImmuneIds)
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.085,
        0.085,
        height,
        RINGED_TUBE_RADIAL_SEGMENTS,
        RINGED_TUBE_HEIGHT_SEGMENTS(height),
      ),
      mat,
    )
    segment.userData.zoomInvariantRadius = 0.085
    segment.position.set(0, (start + end) / 2, 0)
    ringedTubeDashedGroup.add(segment)
  }

  ringedTube.position.copy(midPoint)
  ringedTube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(ringedTube)

  // 4. COLLISION ACCENTS. `ringed`/`dark_texture` are shared overlay groups
  // (no dependency on a real glyph radius); `dashed` is handled per-glyph.
  // See docs/architecture/vector-line-glyphs.md#collision-accents.
  const collisionAccentRinged = new THREE.Group()
  collisionAccentRinged.position.copy(midPoint)
  collisionAccentRinged.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  collisionAccentRinged.visible = false
  group.add(collisionAccentRinged)

  const collisionAccentDarkTexture = new THREE.Group()
  collisionAccentDarkTexture.position.copy(midPoint)
  collisionAccentDarkTexture.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  collisionAccentDarkTexture.visible = false
  group.add(collisionAccentDarkTexture)

  // Accent bands alternating with transparency (colorB null) -- an overlay.
  const collisionRingTexture = makeRingTexture(RING_ACCENT_COLOR, null)
  const darkTextureMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.85,
    metalness: 0.05,
  })

  // Fixed, same as RINGED_TUBE_RING_PERIOD above -- not zoom-responsive.
  const COLLISION_RING_PERIOD = 0.5

  // Sized to the visible glyph's radius (plus a clearance hair), picked per
  // refresh. See docs/architecture/vector-line-glyphs.md#collision-accents.
  const getAccentRadius = (activeStyle) => {
    if (activeStyle === 'ringed_tube') return 0.085 // == baseTube's own radius
    if (activeStyle === 'plain_tube') return 0.051 // == cylinder's own radius
    return 0.035 // no true radius (fat-line) -- a thin nominal size
  }

  const rebuildSharedAccents = (activeStyle) => {
    clearGroupChildren(collisionAccentRinged, true) // each segment gets its own cloned texture + material
    clearGroupChildren(collisionAccentDarkTexture, false) // shares darkTextureMat

    // Clearance must actually separate the surfaces in the depth buffer.
    // See docs/architecture/vector-line-glyphs.md#accent-clearance.
    const radius = getAccentRadius(activeStyle) + 0.006

    currentZones.forEach(({ start, end }) => {
      const height = end - start
      if (height <= 1e-6) return
      const tex = collisionRingTexture.clone()
      tex.needsUpdate = true
      setRingTextureRepeat(tex, height, COLLISION_RING_PERIOD, 1)
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        emissive: RING_ACCENT_COLOR,
        emissiveIntensity: 0.2,
        roughness: RINGED_TUBE_ROUGHNESS,
        metalness: 0.15,
      })
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, RINGED_TUBE_RADIAL_SEGMENTS),
        mat,
      )
      segment.userData.zoomInvariantRadius = radius
      segment.position.set(0, (start + end) / 2, 0)
      collisionAccentRinged.add(segment)
    })

    currentZones.forEach(({ start, end }) => {
      addTubeSegment(collisionAccentDarkTexture, darkTextureMat, radius, start, end, false)
    })
  }

  // Dash/gap LENGTH scales with camera distance (via DashZoomSync ->
  // updateZoomRatio), which is what makes the dash COUNT respond to zoom.
  // Ring band frequency stays fixed. See
  // docs/architecture/vector-line-glyphs.md#dash-length-vs-count.
  const DASH_ZOOM_MIN_SCALE = 0.38
  const DASH_ZOOM_MAX_SCALE = 4
  let lastDashZoomScale = 1
  const thickDashLength = () => THICK_DASHED_SEGMENT_LENGTH * lastDashZoomScale
  const thickGapLength = () => THICK_DASHED_GAP_LENGTH * lastDashZoomScale
  const rebuildThickDashedGlyphs = () => {
    const pairs = computeSegmentPairs(currentZones, true, thickDashLength(), thickGapLength())

    clearGroupChildren(dashedTubeGroup, false) // shares dashedTubeMat
    pairs.forEach(({ start, end }) => {
      addTubeSegment(dashedTubeGroup, dashedTubeMat, 0.051, start, end, false)
    })

    clearGroupChildren(ringedTubeDashedGroup, true) // each segment gets its own cloned texture + material
    pairs.forEach(({ start, end }) => addRingedTubeDashSegment(start, end))
  }
  group.userData.updateZoomRatio = (ratio) => {
    const dashScale = THREE.MathUtils.clamp(ratio, DASH_ZOOM_MIN_SCALE, DASH_ZOOM_MAX_SCALE)
    if (Math.abs(dashScale - lastDashZoomScale) < 0.08) return
    lastDashZoomScale = dashScale
    rebuildThickDashedGlyphs()
    group.userData.refreshGlyph?.()
  }

  group.userData.hasCollisionAccent = false
  group.userData.setCollisionZones = (zones = []) => {
    currentZones = zones || []

    rebuildThickDashedGlyphs()

    group.userData.hasCollisionAccent = currentZones.length > 0
    group.userData.refreshGlyph?.()
  }

  const applyGlyphVisibility = (settings) => {
    const activeStyle = settings.lineStyle || 'plain_line'
    const collisionStyle = settings.lineCollisionStyle || 'dashed'
    const hasAccent = currentZones.length > 0
    const isDashed = hasAccent && collisionStyle === 'dashed'

    // plain_line has no radius for a ring/band accent, so "dashed" (real
    // gaps in its own geometry) is its only collision style.
    const linesNeedDashing = isDashed && activeStyle === 'plain_line'
    setThickLineSegmentPairs(
      linesNeedDashing
        ? computeSegmentPairs(currentZones, true, thickDashLength(), thickGapLength())
        : computeSegmentPairs(currentZones, false),
    )

    const useTubeDashedReplacement = isDashed && activeStyle === 'plain_tube'

    plainLineThickGroup.visible = activeStyle === 'plain_line'

    // "dashed" fully replaces the continuous glyph, so hide the base tube.
    cylinder.visible = activeStyle === 'plain_tube' && !useTubeDashedReplacement
    dashedTubeGroup.visible = useTubeDashedReplacement
    ringedTube.visible = activeStyle === 'ringed_tube'

    const useRingedTubeDashedReplacement = isDashed && activeStyle === 'ringed_tube'
    baseTube.visible = !useRingedTubeDashedReplacement
    ringedTubeDashedGroup.visible = useRingedTubeDashedReplacement

    rebuildSharedAccents(activeStyle)
    collisionAccentRinged.visible = hasAccent && collisionStyle === 'ringed'
    collisionAccentDarkTexture.visible = hasAccent && collisionStyle === 'dark_texture'

    // Only the active style's companion on HALO_LAYER at once.
    // See docs/architecture/vector-line-glyphs.md#one-companion-visible.
    if (haloAvailable) {
      haloCompanionPlainLine.visible = activeStyle === 'plain_line'
      haloCompanionPlainTube.visible = activeStyle === 'plain_tube'
      haloCompanionRingedTube.visible = activeStyle === 'ringed_tube'
    }
  }

  // Lets tubeCollision.js re-apply visibility after setCollisionZones().
  group.userData.refreshGlyph = () => {
    const settings = useSettingsStore?.getState().settings || {}
    applyGlyphVisibility(settings)
  }

  const currentSettings = useSettingsStore?.getState().settings || {}
  applyGlyphVisibility(currentSettings)

  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (window.threeObjStore?.[blockId] !== group) {
        unsubscribe()
        return
      }
      applyGlyphVisibility(state.settings)
      // Live recolor of the flat-color glyphs only; textured glyphs pick up
      // a new preset on the next rebuild.
      const newLineColor = window.GeoScratchColors.forInstance('line', blockId)
      plainLineThickMat.color.set(newLineColor)
      cylMat.color.set(newLineColor)
      dashedTubeMat.color.set(newLineColor)
      if (tSphereRef)
        tSphereRef.material.color.set(
          window.GeoScratchColors.forInstanceVariant('point', blockId, 24),
        )
    })
  }

  const POINT_MARKER_RADIUS = 0.24
  const sphereGeom = new THREE.SphereGeometry(POINT_MARKER_RADIUS, 16, 12)

  if (typeof tRaw !== 'undefined' && Number.isFinite(Number(tRaw))) {
    const tVal = Number(tRaw)
    const rPoint = origin.clone().addScaledVector(direction, tVal)
    const tSphere = new THREE.Mesh(
      sphereGeom,
      new THREE.MeshStandardMaterial({ color: pointColor, roughness: 0.4, metalness: 0.1 }),
    )
    tSphere.userData.zoomInvariantRadius = POINT_MARKER_RADIUS
    tSphere.userData.zoomInvariantUniform = true
    tSphere.position.copy(rPoint)
    group.add(tSphere)
    tSphereRef = tSphere
    group.userData.t = tVal
    group.userData.rPoint = rPoint.clone()

    // Animation opt-in (issue #38 t-sweep): progress 1 = resting, 0 sweeps
    // the marker to the origin. See docs/architecture/vector-line-glyphs.md#userdata-contract.
    group.userData.animate = (p, ease) => {
      const e = typeof ease === 'function' ? ease(p) : p
      const t = THREE.MathUtils.lerp(0, tVal, e)
      tSphere.position.copy(origin).addScaledVector(direction, t)
    }
  } else {
    group.userData.t = undefined
    group.userData.rPoint = undefined
  }

  group.userData.geoType = 'geo_vector_line'
  group.userData.origin = origin.clone()
  group.userData.direction = direction.clone()
  group.userData.direction.userData = {
    geoType: 'named_vector_expression',
    label: lineLabel,
  }
  group.userData.labelAnchors = {
    line: { type: 'local', position: [midPoint.x, midPoint.y, midPoint.z] },
  }
  group.userData.labels = [
    {
      anchor: 'line',
      name: lineLabel,
      value:
        window.vectorNotation.formatVector(origin) +
        ' + t·' +
        window.vectorNotation.formatVector(direction),
      distanceFactor: 8,
      offset: [0.12, 0.12, 0],
      color: lineColor,
    },
  ]
  // For tubeCollision.js's worldSegment(): segment midpoint, not the
  // equation origin. See docs/architecture/vector-line-glyphs.md#userdata-contract.
  group.userData.segmentMid = midPoint.clone()
  group.userData.segmentHalfLength = halfDist
  group.userData.srcBlockId = blockId
  // For generateAndRun.js's line animation: the exact closure + interval
  // this build used (can't share a helper -- this function is .toString()d).
  group.userData.boxInterval = lineBoxInterval
  group.userData.boxExtent = [tEnter, tExit]
  group.userData.tMarker = tSphereRef

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
      this.appendDummyInput()
        .appendField('Line')
        .appendField(new FieldObjectName(), 'GEOSCRATCH_NAME')
      this.appendValueInput('POS').appendField('Position:').setCheck('vector3')
      this.appendValueInput('DIR').appendField('Direction:').setCheck('vector3')
      this.appendValueInput('SCALE').appendField('t:').setCheck('scalar')
      this.setTooltip(
        'A line in R3 that passes through a specific point and runs parallel to the direction vector',
      )
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_LINE)
      this.setColour(forInstance('line', this.id))
    },
  }

  javascriptGenerator.forBlock.geo_vector = function (block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''

    const vecPos = valueToCode('POS') || 'new window.THREE.Vector3(0,0,0)'
    const vecDir = valueToCode('DIR') || 'new window.THREE.Vector3(1,1,1)'

    const scaleInput = block.getInput('SCALE')
    const hasScaleInput = !!scaleInput?.connection?.targetConnection
    const vecScaleCode = hasScaleInput ? valueToCode('SCALE') || '0' : 'undefined'

    const blockId = JSON.stringify(block.id)

    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId})`

    return [code, Order.FUNCTION_CALL]
  }
}
