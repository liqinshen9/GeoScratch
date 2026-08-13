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
  const lineLabel = window.vectorNotation?.assignLineLabel?.(blockId) || 'L'
  // Local tube frame is centred on the segment's midpoint, not the vector
  // equation's origin -- the two only coincide when extentPos === extentNeg.
  const halfDist = distance / 2
  const worldAt = (y) => midPoint.clone().addScaledVector(normalised, y)

  // Collision zones (local Y offsets from midPoint, filled in later by
  // tubeCollision.js via setCollisionZones) and the dash pattern used to
  // punch literal gaps in a glyph for the "dashed" collision style. Shared
  // by every technique style below so there's one definition of "what does
  // dashed look like" instead of several that could drift apart.
  const DASHED_SEGMENT_LENGTH = 0.14
  const DASHED_GAP_LENGTH = 0.09
  let currentZones = []

  // Returns the y-ranges (local offset from midPoint along `normalised`)
  // that should actually be drawn, tagged by whether each is a genuine
  // short "dash" bump (inside a collision zone) or a long continuous
  // "solid" stretch (outside any zone, or the whole line when not dashing
  // at all). The two get different zoom-invariant treatment further down:
  // bumps need to grow in every dimension as the camera pulls back so they
  // don't collapse to sub-pixel, but solid stretches must only grow in
  // cross-section, or neighbouring stretches would visibly gap apart.
  const computeSegmentPairs = (zones, dashed, dashLen = DASHED_SEGMENT_LENGTH, gapLen = DASHED_GAP_LENGTH) => {
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

  // Every "replacement" glyph below (dashed tube segments, ring-textured
  // dash segments, collision accent overlays) rebuilds by clearing a
  // group's children and adding fresh ones every time the zoom scale
  // crosses a threshold or the collision zones change -- which, during a
  // fast zoom/pan, can fire many times a second. `.remove()` only detaches
  // a child from the scene graph; it does NOT free the GPU-side texture/
  // buffer resources a Geometry/Material/Texture hold, so without an
  // explicit `.dispose()` each rebuild leaks GPU memory. A single slow
  // zoom leaks too little to notice, but a fast one can leak enough,
  // enough times a second, to exhaust GPU resources mid-session --
  // surfacing as exactly this kind of corrupted/"torn" texture that
  // doesn't self-heal once it happens. `disposeMaterial` is false for
  // segments sharing one of this glyph's persistent materials (only their
  // per-segment geometry is actually new each rebuild); true only where
  // the material (and its texture, if any -- a clone made just for that
  // segment) is itself freshly created per segment.
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

  // Haloed-line GPU depth-trick (docs/halos-epic-plan.md). A second,
  // invisible-in-the-main-pass "inflated" companion mesh per line style --
  // same shape as whichever glyph is actually visible, bigger radius --
  // tagged with the SAME zoomInvariantRadius mechanism the real glyph uses,
  // so it inflates/deflates in lockstep with it at every zoom level via the
  // existing, already-correct ZoomInvariantScaler, rather than a bespoke
  // per-frame gap-width calculation. HALO_LAYER keeps it out of the normal
  // color pass entirely (see HaloDepthPrepass.jsx); applyHaloDiscardMaterial
  // wires a REAL glyph's material to discard fragments a DIFFERENT haloable
  // object's inflated footprint occludes.
  // Settings > Halos toggle: gates whether a NEW line gets the companion
  // mesh/discard wiring at all. Toggling the setting back on doesn't
  // retroactively add it to lines already built while it was off (would
  // need a scene regeneration to pick it up) -- HaloUniformSync's
  // haloEnabled uniform is what makes on/off instant for already-built
  // lines that DO have the wiring.
  const haloSettingEnabled = useSettingsStore?.getState().settings?.haloEnabled !== false
  const haloAvailable = haloSettingEnabled && window.HALO_LAYER != null && window.getHaloId && window.createHaloIdMaterial && window.applyHaloDiscardMaterial && window.registerHaloLine && window.HALO_MAX_IMMUNE_IDS != null
  // Shared across every material that can end up as the visible glyph, for
  // any line style (cylMat/dashedTubeMat, ringedTubeMat and its dash
  // segments, plainLineThickMat) -- getHaloId is stable per blockId, so
  // reusing it isn't strictly required for correctness, but keeping one id
  // per line is simpler to reason about than re-deriving it per style.
  const haloId = haloAvailable ? window.getHaloId(blockId) : null
  // Ids of other lines THIS line genuinely intersects in 3D (shared array
  // reference, mutated in place by registerHaloLine below whenever a
  // later-built line turns out to touch this one) -- see
  // haloIntersectionRegistry.js. A real 3D touch is a depth-comparison
  // false positive waiting to happen (the two surfaces are ~coincident
  // right there), not a legitimate occlusion, so these ids are exempted
  // from the discard check entirely rather than trying to tune a
  // tolerance around it.
  const haloImmuneIds = haloAvailable ? new Array(window.HALO_MAX_IMMUNE_IDS).fill(-1) : null
  if (haloAvailable) {
    window.registerHaloLine(blockId, origin, normalised, (partnerId) => {
      const slot = haloImmuneIds.indexOf(-1)
      if (slot !== -1) haloImmuneIds[slot] = partnerId
    })
  }

  // Builds one inflated companion mesh sized for a given style's real glyph
  // radius. Every style gets its OWN companion (rather than one shared,
  // roughly-averaged size) so the dilated footprint actually matches what's
  // on screen -- a thin plain_line shouldn't punch as wide a gap as a fat
  // ringed_tube. Only the currently-active style's companion is ever
  // visible at once (see applyGlyphVisibility's haloCompanion*.visible
  // lines below), so the depth prepass never sees two different-sized
  // footprints fighting each other for the same line. Margin kept as small
  // as practical (was 0.051+0.25, then 0.051+0.03, now +0.01) -- any extra
  // 3D-geometry margin here still elongates at shallow crossing angles
  // (scales with 1/sin(angle)), which is the exact sharp-point problem the
  // screen-space dilate step (HaloDilatePass.jsx) exists to avoid. This
  // margin's only job now is clearing self-occlusion/edge noise at the
  // companion/real-surface boundary -- the visible gap shape should come
  // almost entirely from dilation.
  const buildHaloCompanion = (baseRadius) => {
    const radius = baseRadius + 0.01
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, distance, 12),
      window.createHaloIdMaterial(haloId)
    )
    mesh.userData.zoomInvariantRadius = radius
    mesh.position.copy(midPoint)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
    mesh.layers.set(window.HALO_LAYER)
    mesh.visible = false
    group.add(mesh)
    return mesh
  }

  // 1. TECHNIQUE STYLE: Plain Line. WebGL clamps LineBasicMaterial's
  // linewidth to 1px on most platforms (ANGLE on Windows, notably), so a
  // real solid-mesh line is the only way to make this style visibly
  // thicker. Built with three's "fat lines" (LineSegments2/
  // LineSegmentsGeometry/LineMaterial) rather than a cylinder: a cylinder is
  // a real 3D solid, so its two ends foreshorten independently whenever
  // they're at different distances from the camera (same reason a distant
  // object looks smaller), which a literal GL line never does -- it's a
  // 0-width primitive the GPU always strokes to a flat, constant-width
  // screen-space band. LineMaterial's default worldUnits:false mode
  // reproduces exactly that: `linewidth` is a pixel width applied per-point
  // in screen space via the vertex shader, so this reads as "a real GL
  // line, just actually visible" at any zoom or angle, rather than a thin
  // 3D tube. Its resolution uniform and the "Extra Thick Lines" pixel-width
  // multiplier are kept in sync from Scene3D's FatLineSync
  // (geoVectorLineDefinition has no access to canvas size here).
  //
  // One LineSegments2 per pair (a small group), NOT one LineSegmentsGeometry
  // holding all pairs as separate instances: a multi-instance
  // LineSegmentsGeometry can silently fail to render some of its instances
  // depending on camera distance/angle (reproduced directly -- 2 instances
  // in one geometry: one vanishes when zoomed in close; the same 2 segments
  // as 2 separate single-instance objects: both render correctly at the
  // same camera state). Each pair gets its own tiny geometry/object instead,
  // sharing one material.
  const PLAIN_LINE_THICK_BASE_PX = 2.2
  const plainLineThickMat = new THREE.LineMaterial({
    color: 0x374151,
    linewidth: PLAIN_LINE_THICK_BASE_PX,
    worldUnits: false,
  })
  const plainLineThickGroup = new THREE.Group()
  group.add(plainLineThickGroup)

  // No true 3D radius (it's a screen-space fat line, not a solid), so its
  // companion uses the same thin nominal size the collision-accent ring
  // overlay falls back to for this style (see getAccentRadius below).
  const haloCompanionPlainLine = haloAvailable ? buildHaloCompanion(0.035) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(plainLineThickMat, haloId, haloImmuneIds)

  // Plain Line (thick) is a "0 radius" glyph, sharing the bigger,
  // zoom-responsive THICK_DASHED_* sizing with plain_tube (see
  // rebuildThickDashedGlyphs) so the dashed look is consistent across every
  // "thick" line style, not just plain_tube. One LineSegments2 child per
  // pair (see plainLineThickGroup's comment above for why).
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

  // 2. TECHNIQUE STYLE: Plain Tube (Cylinder). MeshStandardMaterial (not
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

  const haloCompanionPlainTube = haloAvailable ? buildHaloCompanion(0.051) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(cylMat, haloId, haloImmuneIds)

  // 3b. "dashed" collision-style replacement for the plain tube: REPLACES
  // the base cylinder (rather than overlaying it) with alternating
  // solid/gap segments across collision zones, so the solid actually shows
  // through the gaps instead of the continuous tube covering them. Outside
  // any zone the tube stays one continuous solid piece.
  const dashedTubeGroup = new THREE.Group()
  dashedTubeGroup.position.copy(midPoint)
  dashedTubeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  dashedTubeGroup.visible = false
  group.add(dashedTubeGroup)

  // Same shaded material as the continuous plain tube (cylMat) -- the
  // dashed segments are that same glyph, just chopped up, so they shouldn't
  // suddenly look flat/unlit when the dashed collision style is active.
  const dashedTubeMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.1 })
  // A SEPARATE material from cylMat -- when this line is ALSO the dashed
  // replacement (collision zones, or its own crossing gap), this is what's
  // actually visible, not cylMat. Without wiring it through the discard
  // shader too, a colliding line's own gap silently stops working (its
  // real surface never discards) even though other lines still gap
  // correctly around IT, since its inflated companion is unaffected by
  // collision state -- exactly the asymmetric bug reported.
  if (haloAvailable) window.applyHaloDiscardMaterial(dashedTubeMat, haloId, haloImmuneIds)

  // Tuned bigger than the shared DASHED_SEGMENT_LENGTH/DASHED_GAP_LENGTH --
  // "fewer, larger dashes" reads better on a real solid tube than the small
  // default pattern. Shared by every "thick" dashed glyph (plain_tube,
  // plain_line-thick) so they all look consistent, not just plain_tube.
  // Deliberately NOT zoom-invariant-scaled per-segment
  // (see addTubeSegment's `uniform` param, passed false for these): a dash
  // is a literal piece of the glyph's own length, not a separate small
  // accent glyph like a ring, so it should get bigger/smaller with normal
  // perspective exactly like the glyph itself (and the solid it's crossing)
  // does. Instead, DashZoomSync (Scene3D.jsx) multiplies these by a
  // camera-distance-derived scale each time it changes meaningfully (see
  // group.userData.updateDashZoomScale below) -- that's what makes the
  // dash COUNT itself respond to zoom, not just each dash's apparent size.
  const THICK_DASHED_SEGMENT_LENGTH = 0.45
  const THICK_DASHED_GAP_LENGTH = 0.3

  // `uniform` marks a piece as a discrete "bump" that should scale
  // apparent-size-constant in every dimension (see the zoom-invariant note
  // by computeSegmentPairs) rather than just in cross-section.
  const addTubeSegment = (targetGroup, material, radius, start, end, uniform) => {
    const height = end - start
    if (height <= 1e-6) return
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), material)
    segment.userData.zoomInvariantRadius = radius
    if (uniform) segment.userData.zoomInvariantUniform = true
    segment.position.set(0, (start + end) / 2, 0)
    targetGroup.add(segment)
  }

  // Single named color for the shared "ring accent" collision overlay
  // (collisionRingTexture, below) -- pulled from HERE so retuning the whole
  // project's ring accent color later is a one-line change instead of a
  // hunt through several materials.
  // TODO: replace with a shared color/theme module once colors are
  // designed project-wide; pink is a placeholder for now.
  const RING_ACCENT_COLOR = 0xec4899

  // Builds a small repeating 2-color striped texture (alternating bands
  // along its V axis) instead of many separate ring meshes. This is what
  // makes a "ring texture" ACTUALLY behave like a texture: it's painted
  // flat onto whichever cylinder it's applied to (so it structurally cannot
  // bulge), and changing the band frequency in response to zoom is a single
  // cheap `texture.repeat.y` write -- no geometry to destroy and rebuild
  // every time the zoom scale crosses a threshold, which was the source of
  // the flicker with the old many-small-rings approach (every rebuild
  // popped in brand-new meshes with a one-frame-stale scale, and shifted
  // every ring's position at once). `colorB` may be null for a fully
  // transparent second band (used by the collision accent overlay, so the
  // glyph underneath shows through in the gaps instead of a second flat
  // color).
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
    // Hard-edged 2-color stripes are worst-case content for texture
    // filtering: bilinear magFilter blurs the band boundary into a soft
    // gradient at any zoom where a band covers more than a few screen
    // pixels (the "not crisp" look), and with no anisotropy the GPU's
    // mipmap selection for a repeating pattern viewed at a shallow angle
    // (a tube running away from the camera) picks an inconsistent mip
    // level per screen pixel frame-to-frame -- the "flickering"/torn-edge
    // look. Nearest magFilter keeps close-up edges crisp; a high
    // anisotropy (clamped by three.js to whatever the GPU actually
    // supports) fixes the grazing-angle minification aliasing. Both are
    // read by every clone of this texture (ring dash segments, collision
    // accent overlay) since clone() copies these fields too.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = 16
    return texture
  }
  // Applies a period (world units per light+dark cycle) to a texture sized
  // for a cylinder of the given world-space length -- shared by every
  // ring-textured glyph below (ringed_tube's own base tube and dashed
  // segments, and the collision accent overlay) so they all resize the same
  // way in response to zoom.
  const setRingTextureRepeat = (texture, length, period, scale) => {
    texture.repeat.set(1, length / (period * scale))
  }

  // 3. TECHNIQUE STYLE: Ringed Tube
  const ringedTube = new THREE.Group()

  // Fixed at build time and never touched again as the camera moves --
  // ring band frequency is intentionally NOT zoom-responsive (unlike the
  // dash length below), so there is no per-frame or per-threshold texture
  // rebuild for it to race against the cross-section's own zoom-invariant
  // scaling during a fast zoom/pan.
  const RINGED_TUBE_RING_PERIOD = 0.8

  // THE ACTUAL BUG: CylinderGeometry(r, r, height, radialSegments) has only
  // ONE height segment unless told otherwise -- its side is just two giant
  // triangles per radial facet, spanning the tube's ENTIRE length (up to
  // ~40 world units, see extentPos/extentNeg above) against a radius of
  // 0.085. That's an aspect ratio upwards of 1000:1 -- a "needle" triangle.
  // The collision-accent ring (rebuildSharedAccents, below) never hits
  // this: its cylinders are only ever as long as one collision zone (a
  // handful of world units at most), never the whole line -- which is
  // exactly why it renders cleanly on the SAME geometry/material recipe
  // while this one didn't. Perspective-correct texture-coordinate
  // interpolation across a triangle that extreme loses precision on at
  // least some GPU/driver combinations, worse the more that triangle is
  // foreshortened on screen (i.e. worse from an oblique angle, fine
  // looking straight down the tube) -- matching exactly what breaks and
  // what doesn't. Giving the tube real height segments (one roughly per
  // ring) keeps every individual triangle short, however long the tube
  // itself is, which is the fix -- not the ring size/count itself.
  const RINGED_TUBE_HEIGHT_SEGMENTS = (length) => Math.max(1, Math.ceil(length / RINGED_TUBE_RING_PERIOD) * 2)
  // A 16-sided cylinder is visibly faceted under a specular highlight --
  // each flat facet catches the light slightly differently, and wherever
  // that per-facet brightness step happens to land on one of the texture's
  // hard color-band edges, it reads as a jagged/torn cut instead of a
  // clean ring. More radial segments (rounder cross-section) plus a
  // softer, less mirror-like highlight (higher roughness) both shrink
  // that per-facet step, independent of anything zoom- or texture-repeat-
  // related.
  const RINGED_TUBE_RADIAL_SEGMENTS = 48
  const RINGED_TUBE_ROUGHNESS = 0.75
  // NOTE: deliberately NOT transparent (unlike the collision-accent ring
  // below, which is meant to be a see-through overlay). This is the solid
  // base tube -- setting transparent:true here (as an earlier attempt at
  // the jagged-texture bug did, before the real fix turned out to be the
  // height-segment change above) moves it into the transparent render
  // queue, which sorts whole objects by distance rather than testing
  // per-pixel depth, breaking correct occlusion against any OTHER
  // transparent object (e.g. a see-through cube) it happens to cross.
  // Staying opaque keeps it in the normal depth-tested pass, same as
  // plain_tube's cylinder, which occludes/is-occluded correctly.
  const RINGED_TUBE_EMISSIVE_COLOR = 0x71717a
  const RINGED_TUBE_EMISSIVE_INTENSITY = 0.2
  const RINGED_TUBE_METALNESS = 0.15
  const ringedTubeTexture = makeRingTexture(0xa1a1aa, 0x3f3f46)
  setRingTextureRepeat(ringedTubeTexture, distance, RINGED_TUBE_RING_PERIOD, 1)
  const ringedTubeMat = new THREE.MeshStandardMaterial({
    map: ringedTubeTexture,
    emissive: RINGED_TUBE_EMISSIVE_COLOR,
    emissiveIntensity: RINGED_TUBE_EMISSIVE_INTENSITY,
    roughness: RINGED_TUBE_ROUGHNESS,
    metalness: RINGED_TUBE_METALNESS,
  })

  const baseTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, distance, RINGED_TUBE_RADIAL_SEGMENTS, RINGED_TUBE_HEIGHT_SEGMENTS(distance)),
    ringedTubeMat
  )
  baseTube.userData.zoomInvariantRadius = 0.085
  ringedTube.add(baseTube)

  const haloCompanionRingedTube = haloAvailable ? buildHaloCompanion(0.085) : null
  if (haloAvailable) window.applyHaloDiscardMaterial(ringedTubeMat, haloId, haloImmuneIds)

  // "dashed" collision style REPLACES the base tube (rather than overlaying
  // it) with alternating solid/gap segments across collision zones, exactly
  // like plain_tube's dashedTubeGroup -- reuses the same ring texture
  // (cloned per segment so each can carry its own correctly-scaled repeat)
  // so a solid stretch still reads as "ringed tube" rather than suddenly
  // looking like a different style.
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
    // A fresh material every call (see the comment above), so a colliding
    // ringed_tube's own gap needs the same per-segment discard wiring
    // dashedTubeMat gets for plain_tube -- otherwise its dashed replacement
    // never discards its own occluded fragments even though other lines
    // still gap correctly around it.
    if (haloAvailable) window.applyHaloDiscardMaterial(mat, haloId, haloImmuneIds)
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, height, RINGED_TUBE_RADIAL_SEGMENTS, RINGED_TUBE_HEIGHT_SEGMENTS(height)), mat)
    segment.userData.zoomInvariantRadius = 0.085
    segment.position.set(0, (start + end) / 2, 0)
    ringedTubeDashedGroup.add(segment)
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

  // 4. COLLISION ACCENTS: how a line indicates the exact stretch(es) where
  // it passes into a solid object. Two of the three interchangeable looks
  // (picked via settings.lineCollisionStyle) are pure overlay geometry --
  // small rings, or a darker band -- anchored to the same local frame as
  // cylinder/ringedTube (Y axis along the line, origin at midPoint) but with
  // NO dependency on the currently-active glyph having a real radius, so a
  // single shared pair of groups works for every line style (plain_line,
  // plain_tube, ringed_tube) rather than needing its own copy per style.
  // The third style, "dashed", instead punches a literal gap in whichever
  // glyph is actually visible right now -- there's no "overlay" that can
  // remove material from something else, so that one is handled per-glyph
  // (dashedTubeGroup / ringedTubeDashedGroup / setThickLineSegmentPairs
  // visibility, above and below).
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

  // Pink bands alternating with full transparency (colorB: null), so the
  // glyph underneath shows through in the gaps instead of a second flat
  // color -- this is the overlay, not a whole-tube replacement.
  const collisionRingTexture = makeRingTexture(RING_ACCENT_COLOR, null)
  const darkTextureMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.05 })

  // Fixed, same as RINGED_TUBE_RING_PERIOD above -- not zoom-responsive.
  const COLLISION_RING_PERIOD = 0.5

  // Sized to match whichever glyph is actually visible right now (plus a
  // hair so it sits just outside a coincident surface instead of z-fighting
  // it), so the ring reads as a texture ON the line rather than a bump
  // bulging off it -- picked per refresh (below), not fixed at build time.
  const getAccentRadius = (activeStyle) => {
    if (activeStyle === 'ringed_tube') return 0.085 // == baseTube's own radius
    if (activeStyle === 'plain_tube') return 0.051 // == cylinder's own radius
    return 0.035 // no true radius (fat-line) -- a thin nominal size
  }

  const rebuildSharedAccents = (activeStyle) => {
    clearGroupChildren(collisionAccentRinged, true) // each segment gets its own cloned texture + material
    clearGroupChildren(collisionAccentDarkTexture, false) // shares darkTextureMat

    // The "hair" of clearance from getAccentRadius's own base radius needs to
    // be big enough to actually separate the two surfaces in the depth
    // buffer, not just nonzero -- 0.001 (the original value) was still close
    // enough to the base tube's own radius that at ordinary camera distances
    // the two z-fought, and which one "won" was inconsistent per-pixel. For
    // collisionAccentRinged (semi-transparent) that mostly just looked like a
    // faint flicker; for collisionAccentDarkTexture (a fully opaque overlay
    // meant to completely replace what's underneath) it meant the base
    // tube's own ring texture kept showing through instead of being hidden.
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
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, RINGED_TUBE_RADIAL_SEGMENTS), mat)
      segment.userData.zoomInvariantRadius = radius
      segment.position.set(0, (start + end) / 2, 0)
      collisionAccentRinged.add(segment)
    })

    currentZones.forEach(({ start, end }) => {
      addTubeSegment(collisionAccentDarkTexture, darkTextureMat, radius, start, end, false)
    })
  }

  // Rebuilds plain_tube's dashedTubeGroup (the separate, hidden-unless-
  // active "replacement" object) at the given zoom scale -- called once at
  // scale 1 below, then kept in sync with the camera by Scene3D's
  // DashZoomSync (group.userData.updateZoomRatio), which is the only thing
  // that can see the camera each frame. Scaling the dash/gap LENGTH (not
  // just cross-section radius) by camera distance is what makes the actual
  // dash COUNT respond to zoom: fewer, bigger dashes fit across the same
  // fixed-width collision zone as the camera pulls back, and more, smaller
  // (but still legible) ones as it moves in -- unlike a flat apparent-size-
  // constant scale (see zoomInvariantUniform elsewhere in this file), which
  // only changes how big each already-fixed-count dash looks. Built
  // unconditionally "as if" dashed is active (matching the pre-existing
  // precedent for this group) since actual visibility is gated separately
  // below; plain_line-thick has no such separate object to hide behind --
  // its own geometry IS the toggle -- so it's handled inside
  // applyGlyphVisibility instead, using the same lastDashZoomScale.
  //
  // Only the dash length/count responds to zoom -- ring band frequency
  // (RINGED_TUBE_RING_PERIOD/COLLISION_RING_PERIOD, set where each texture
  // is built) is fixed and never rebuilt off the camera, so there's no
  // ring-texture rebuild to land mid-frame during a fast zoom/pan.
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

    // plain_line has no tube radius for a ring/band accent to sit on, so
    // "dashed" is the only collision style that reads on it at all -- it
    // punches real gaps straight into its own geometry.
    const linesNeedDashing = isDashed && activeStyle === 'plain_line'
    // plain_line-thick shares the bigger THICK_DASHED_* sizing (and its
    // current zoom scale) with plain_tube instead of a small fixed pattern,
    // so "thick" reads consistently across every line style.
    setThickLineSegmentPairs(
      linesNeedDashing
        ? computeSegmentPairs(currentZones, true, thickDashLength(), thickGapLength())
        : computeSegmentPairs(currentZones, false)
    )

    const useTubeDashedReplacement = isDashed && activeStyle === 'plain_tube'

    plainLineThickGroup.visible = activeStyle === 'plain_line'

    // The dashed collision style fully replaces the plain-tube glyph (real
    // gaps instead of an overlay), so hide the continuous base tube while
    // it's active.
    cylinder.visible = activeStyle === 'plain_tube' && !useTubeDashedReplacement
    dashedTubeGroup.visible = useTubeDashedReplacement
    ringedTube.visible = activeStyle === 'ringed_tube'

    // Same "dashed fully replaces the continuous glyph" treatment as
    // plain_tube -- ringed_tube no longer has individual ring meshes to
    // hide, just its own (now texture-based) dashedTubeGroup analogue.
    const useRingedTubeDashedReplacement = isDashed && activeStyle === 'ringed_tube'
    baseTube.visible = !useRingedTubeDashedReplacement
    ringedTubeDashedGroup.visible = useRingedTubeDashedReplacement

    rebuildSharedAccents(activeStyle)
    // ringed_tube's "ringed" collision style now goes through this same
    // shared overlay too (no more special-casing) -- it's just a pink-
    // textured band sitting a hair outside the base tube's own radius,
    // same as every other style.
    collisionAccentRinged.visible = hasAccent && collisionStyle === 'ringed'
    collisionAccentDarkTexture.visible = hasAccent && collisionStyle === 'dark_texture'

    // Only the active style's own companion should ever be on HALO_LAYER at
    // once -- three differently-sized footprints for the same line would
    // fight each other in the depth prepass (see buildHaloCompanion above).
    if (haloAvailable) {
      haloCompanionPlainLine.visible = activeStyle === 'plain_line'
      haloCompanionPlainTube.visible = activeStyle === 'plain_tube'
      haloCompanionRingedTube.visible = activeStyle === 'ringed_tube'
    }
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

  // Matches the standalone Point block's own marker radius (linalg_point in
  // vector3.js) -- these are also "points" in the same visual language, so
  // they should read as the same size, not a smaller, easy-to-miss dot.
  const POINT_MARKER_RADIUS = 0.24
  const sphereGeom = new THREE.SphereGeometry(POINT_MARKER_RADIUS, 16, 12)
  const originSphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.1 })
  )
  originSphere.userData.zoomInvariantRadius = POINT_MARKER_RADIUS
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
    tSphere.userData.zoomInvariantRadius = POINT_MARKER_RADIUS
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
  group.userData.direction.userData = {
    geoType: 'named_vector_expression',
    label: lineLabel,
  }
  group.userData.labelAnchors = {
    line: { type: 'local', position: [midPoint.x, midPoint.y, midPoint.z] },
  }
  group.userData.labels = [
    { anchor: 'line', text: lineLabel, distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#374151' },
  ]
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

    const vecPos = valueToCode('POS') || 'new window.THREE.Vector3(0,0,0)'
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
