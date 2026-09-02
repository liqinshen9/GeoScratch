import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import { OBJECT_HIGHLIGHT_STYLES, SELECTION_HIGHLIGHT_COLOR } from '@/store/highlightStyles'

// BLINK: a material is forced transparent and its opacity gently oscillates
// between this floor and 1. EXCEPTION: a plane's own translucent materials keep
// their transparency (a plane is too big to read well as a solid wall) --
// those pulse only from their own opacity toward, but never past,
// (opacity + BOOST) capped at MAX.
const BLINK_MIN_OPACITY = 0.55
const BLINK_SPEED = 4 // rad/s -> ~1.5s period
const BLINK_TRANSPARENT_BOOST = 0.26
const BLINK_TRANSPARENT_MAX = 0.75
// GLOW: real light coming off the object -- a warm point light at its centre
// plus a soft radial haze -- while its own colour stays intact.
const GLOW_LIGHT_INTENSITY = 1.8
// pointLight.distance = radius * this: kept tight so the light wraps the object
// rather than flooding the whole scene for a big one. With decay 0 the surface
// irradiance is intensity * (1 - 1/factor) -- size-independent.
const GLOW_LIGHT_RANGE_FACTOR = 3
const GLOW_SPRITE_RADIUS_FACTOR = 2.6 // sprite scale = radius * this (halo wraps the object)
const GLOW_SPRITE_OPACITY = 0.7
const GLOW_EMISSIVE_INTENSITY = 0.2 // subtle -- the surface looks lit, not repainted
const GLOW_RADIUS_MIN = 0.5
const GLOW_RADIUS_MAX = 4
// A default-size solid (~1.5 bounding radius) glows at full strength; larger
// ones are dialled back so a 2x teapot doesn't wash the scene (the halo area
// would otherwise grow with radius^2).
const GLOW_RADIUS_REF = 1.5
// For a vector: the arrowhead + shaft glow amber (emissive), a soft halo RING
// hugs the head (depthTest off so it never clips the cone), and a faint haze
// trails a little way back down the shaft. Fixed size, not scaled by length.
const GLOW_HEAD_RADIUS = 0.55
const GLOW_HEAD_TRAIL = 1.6 // trailing haze sits this * radius back from the tip
const GLOW_HEAD_EMISSIVE_INTENSITY = 0.28

// For a plane, the glow lives on the border but fades inward toward the middle
// rather than being a hard rim: a couple of thin bright edge lines ([width,
// opacity], world units) plus a texture-faded amber fill.
const GLOW_PLANE_EDGE_LAYERS = [
  [0.05, 0.6],
  [0.2, 0.18],
]
const GLOW_PLANE_FILL_OPACITY = 0.42
// Fraction of the half-span (centre -> edge) left un-glowed in the middle; the
// amber ramps from here out to the border.
const GLOW_PLANE_FILL_INNER = 0.32

// Radial white gradient (opaque centre -> transparent edge), tinted per use via
// SpriteMaterial.color. Built once, shared, never disposed.
let radialGlowTexture = null
function getRadialGlowTexture() {
  if (radialGlowTexture) return radialGlowTexture
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.2)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  radialGlowTexture = new THREE.CanvasTexture(canvas)
  radialGlowTexture.colorSpace = THREE.SRGBColorSpace
  return radialGlowTexture
}

// Soft amber ring: transparent centre -> bright ring -> transparent outer, so
// it forms a halo AROUND an object's silhouette instead of a disc over it.
let ringGlowTexture = null
function getRingGlowTexture() {
  if (ringGlowTexture) return ringGlowTexture
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.32, 'rgba(255,255,255,0.12)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  ringGlowTexture = new THREE.CanvasTexture(canvas)
  ringGlowTexture.colorSpace = THREE.SRGBColorSpace
  return ringGlowTexture
}

// White with a soft transparent hole in the middle: opaque toward the edges,
// clear in the centre. Painted onto a copy of the plane so the glow fills in
// from the border. Tinted per use via material.color. Built once, shared.
let edgeFadeTexture = null
function getEdgeFadeTexture() {
  if (edgeFadeTexture) return edgeFadeTexture
  const s = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(255,255,255,1)'
  ctx.fillRect(0, 0, s, s)
  ctx.globalCompositeOperation = 'destination-out'
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(GLOW_PLANE_FILL_INNER, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  edgeFadeTexture = new THREE.CanvasTexture(canvas)
  edgeFadeTexture.colorSpace = THREE.SRGBColorSpace
  return edgeFadeTexture
}

function materialsOf(child) {
  if (Array.isArray(child.material)) return child.material
  return child.material ? [child.material] : []
}

// --- BLINK (default): pulse the selected object's opacity ---------------------

function isPlanePart(object) {
  let node = object
  while (node) {
    if (node.userData?.geoType === 'plane_mesh') return true
    node = node.parent
  }
  return false
}

function applyBlink(targets) {
  const seen = new Map()
  targets.forEach((t) =>
    t.traverse((child) => {
      // Only a plane's own already-translucent materials keep their
      // transparency; everything else blinks 0.55..1 as normal.
      const keepTranslucent = isPlanePart(child) && child.material
      materialsOf(child).forEach((m) => {
        if (!m || seen.has(m.uuid)) return
        const soft = keepTranslucent && m.transparent === true && m.opacity < 1
        const lo = soft ? m.opacity : BLINK_MIN_OPACITY
        const hi = soft
          ? Math.max(lo, Math.min(m.opacity + BLINK_TRANSPARENT_BOOST, BLINK_TRANSPARENT_MAX))
          : 1
        seen.set(m.uuid, { m, transparent: m.transparent, opacity: m.opacity, lo, hi })
      })
    })
  )
  const captured = [...seen.values()]
  captured.forEach(({ m }) => {
    m.transparent = true
    m.needsUpdate = true
  })

  const tick = (elapsed) => {
    const k = 0.5 + 0.5 * Math.sin(elapsed * BLINK_SPEED)
    captured.forEach(({ m, lo, hi }) => {
      m.opacity = lo + (hi - lo) * k
    })
  }

  const restore = () => {
    captured.forEach(({ m, transparent, opacity }) => {
      m.transparent = transparent
      m.opacity = opacity
      m.needsUpdate = true
    })
  }

  return { tick, restore }
}

// --- GLOW: an actual warm light + a soft radial haze ------------------------

// A camera-facing haze sprite at `center` (+ an optional warm point light).
// `strength` (0..1) scales brightness; sprites are cheap, lights are not, so
// trailing/secondary glows pass withLight:false. `ring` swaps the solid disc
// for a halo; `depthTest:false` stops the sprite clipping against geometry it
// overlaps (a flat billboard vs. a cone gives a hard cut otherwise).
function addGlowAt(scene, accent, center, radius, strength, opts = {}) {
  const { withLight = true, ring = false, depthTest = true } = opts
  let light = null
  if (withLight) {
    light = new THREE.PointLight(
      accent,
      GLOW_LIGHT_INTENSITY * strength,
      radius * GLOW_LIGHT_RANGE_FACTOR,
      0
    )
    light.position.copy(center)
    light.castShadow = false
    scene.add(light)
  }

  const spriteMat = new THREE.SpriteMaterial({
    map: ring ? getRingGlowTexture() : getRadialGlowTexture(),
    color: accent,
    transparent: true,
    opacity: GLOW_SPRITE_OPACITY * strength,
    depthWrite: false,
    depthTest,
  })
  const sprite = new THREE.Sprite(spriteMat)
  sprite.position.copy(center)
  sprite.scale.setScalar(radius * GLOW_SPRITE_RADIUS_FACTOR)
  sprite.raycast = () => {}
  if (!depthTest) sprite.renderOrder = 9998
  scene.add(sprite)

  return { light, sprite, spriteMat }
}

// World-space arrowhead tip + direction of every vector-shaft glyph in the
// subtree (buildVectorShaftGlyph tags its group with vectorOrigin/Direction/
// Length).
function collectVectorHeads(targets) {
  const heads = []
  targets.forEach((t) =>
    t.traverse((child) => {
      const ud = child.userData
      if (!ud?.vectorDirection?.isVector3 || !ud.vectorOrigin?.isVector3) return
      if (!Number.isFinite(ud.vectorLength)) return
      child.updateMatrixWorld(true)
      const tip = ud.vectorOrigin
        .clone()
        .addScaledVector(ud.vectorDirection, ud.vectorLength)
        .applyMatrix4(child.matrixWorld)
      const dir = ud.vectorDirection.clone().transformDirection(child.matrixWorld).normalize()
      heads.push({ tip, dir })
    })
  )
  return heads
}

function collectPlaneMeshes(targets) {
  const meshes = []
  targets.forEach((t) =>
    t.traverse((child) => {
      if (child.userData?.geoType === 'plane_mesh' && child.geometry) meshes.push(child)
    })
  )
  return meshes
}

// A plane's border glow: thin bright edge line(s) for definition, plus a
// texture-faded amber fill that ramps in from the border toward the middle so
// it isn't a hard rim. All parented onto the plane mesh so they track it.
function addPlaneEdgeGlow(planeMesh, accent, size) {
  const out = []

  // Faded fill: a copy of the plane painted with the edge-fade texture.
  const fillMat = new THREE.MeshBasicMaterial({
    map: getEdgeFadeTexture(),
    color: accent,
    transparent: true,
    opacity: GLOW_PLANE_FILL_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const fill = new THREE.Mesh(planeMesh.geometry, fillMat) // geometry shared
  fill.raycast = () => {}
  fill.renderOrder = 9990
  planeMesh.add(fill)
  out.push({ obj: fill, mat: fillMat, geom: null })

  // Bright edge line(s).
  const edgesGeom = new THREE.EdgesGeometry(planeMesh.geometry)
  const fatGeom = new LineSegmentsGeometry().fromEdgesGeometry(edgesGeom)
  edgesGeom.dispose()
  GLOW_PLANE_EDGE_LAYERS.forEach(([width, opacity], i) => {
    const mat = new LineMaterial({
      color: accent.getHex(),
      linewidth: width,
      worldUnits: true,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    if (size) mat.resolution.set(size.width, size.height)
    const edge = new LineSegments2(fatGeom, mat)
    edge.raycast = () => {}
    edge.renderOrder = 9992 + (GLOW_PLANE_EDGE_LAYERS.length - i)
    planeMesh.add(edge)
    out.push({ obj: edge, mat, geom: i === 0 ? fatGeom : null })
  })

  return out
}

function applyGlow(targets, scene, size) {
  const accent = new THREE.Color(SELECTION_HIGHLIGHT_COLOR)
  const parts = [] // { light, sprite, spriteMat }
  const added = [] // { obj, mat, geom } parented into the scene graph
  const nudged = [] // emissive-bumped materials (bbox path only)
  const hidden = [] // objects temporarily hidden for the duration of the glow

  const planeMeshes = collectPlaneMeshes(targets)
  const heads = planeMeshes.length ? [] : collectVectorHeads(targets)

  if (planeMeshes.length) {
    // Plane: glow radiating from the border, ignoring the defining point +
    // normal glyphs. Hide the plane's own edge line first -- it's translucent
    // and sorts inconsistently against the glow, so it peeks through on one
    // side or the other as the camera moves; the glow gives its own border.
    planeMeshes.forEach((pm) => {
      pm.children.forEach((c) => {
        if (c.isLineSegments && c.visible) {
          c.visible = false
          hidden.push(c)
        }
      })
      added.push(...addPlaneEdgeGlow(pm, accent, size))
    })
  } else if (heads.length) {
    // Vector(s): the arrowhead + shaft glow amber, a halo ring hugs the head
    // (depthTest off so it never clips the cone), and a faint haze trails back
    // down the shaft. Softer per-head when several share the selection.
    const strength = heads.length > 1 ? 0.75 : 1
    heads.forEach(({ tip, dir }) => {
      const headCenter = tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * 0.4)
      parts.push(
        addGlowAt(scene, accent, headCenter, GLOW_HEAD_RADIUS * 0.68, strength * 0.75, {
          ring: true,
          depthTest: false,
        })
      )
      const trail = tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * GLOW_HEAD_TRAIL)
      parts.push(
        addGlowAt(scene, accent, trail, GLOW_HEAD_RADIUS * 1.1, strength * 0.22, {
          withLight: false,
          depthTest: false,
        })
      )
    })

    // Make the vector's own geometry glow so the halo reads as light coming off
    // it rather than a blob floating nearby.
    targets.forEach((t) =>
      t.traverse((child) => {
        if (child.userData?.thickenGroup !== 'vector' || child.visible === false) return
        materialsOf(child).forEach((m) => {
          if (!m || nudged.some((e) => e.m === m)) return
          if (m.emissive?.isColor) {
            nudged.push({ m, emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity ?? 1 })
            m.emissive.copy(accent)
            m.emissiveIntensity = GLOW_HEAD_EMISSIVE_INTENSITY
          } else if (m.color?.isColor) {
            nudged.push({ m, color: m.color.clone() })
            m.color.lerp(accent, 0.15)
          }
          m.needsUpdate = true
        })
      })
    )
  } else {
    const box = new THREE.Box3()
    let hasBounds = false
    targets.forEach((t) => {
      t.updateMatrixWorld(true)
      const b = new THREE.Box3().setFromObject(t)
      if (!b.isEmpty()) {
        box.union(b)
        hasBounds = true
      }
    })
    if (hasBounds) {
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      const radius = THREE.MathUtils.clamp(sphere.radius, GLOW_RADIUS_MIN, GLOW_RADIUS_MAX)
      // Bigger object -> a touch fainter (a hard cut looks deliberately
      // greyed-out), so a 2x teapot doesn't read as twice as glowy.
      const strength = THREE.MathUtils.clamp(Math.sqrt(GLOW_RADIUS_REF / radius), 0.78, 1)
      parts.push(addGlowAt(scene, accent, sphere.center, radius, strength))
    }

    // A touch of emissive so the surface itself reads as lit from within.
    targets.forEach((t) =>
      t.traverse((child) => {
        materialsOf(child).forEach((m) => {
          if (!m?.emissive?.isColor || nudged.some((e) => e.m === m)) return
          nudged.push({ m, emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity ?? 1 })
          m.emissive.copy(accent)
          m.emissiveIntensity = GLOW_EMISSIVE_INTENSITY
          m.needsUpdate = true
        })
      })
    )
  }

  return {
    restore: () => {
      parts.forEach(({ light, sprite, spriteMat }) => {
        if (light) {
          scene.remove(light)
          light.dispose?.()
        }
        scene.remove(sprite)
        spriteMat.dispose() // shared radial texture is left alone
      })
      added.forEach(({ obj, mat, geom }) => {
        obj.removeFromParent()
        mat.dispose()
        geom?.dispose()
      })
      hidden.forEach((c) => {
        c.visible = true
      })
      nudged.forEach((e) => {
        if (e.emissive) {
          e.m.emissive.copy(e.emissive)
          e.m.emissiveIntensity = e.emissiveIntensity
        } else {
          e.m.color.copy(e.color)
        }
        e.m.needsUpdate = true
      })
    },
  }
}

function applyHighlight(style, targets, scene, size) {
  if (style === OBJECT_HIGHLIGHT_STYLES.GLOW) return applyGlow(targets, scene, size)
  return applyBlink(targets)
}

// Headless. Mounted under <Scene>, follows the ZoomInvariantScaler pattern:
// resolves the selected block's 3D object(s) and applies the chosen highlight,
// restoring the previous visual on deselect / style change / scene rebuild.
export default function SelectionHighlight({ objects = [] }) {
  const { scene, invalidate, size } = useThree()
  const selectedBlockId = useWorkspaceStore((s) => s.selectedBlockId)
  const enabled = useSettingsStore((s) => s.settings.objectHighlightEnabled)
  const style = useSettingsStore((s) => s.settings.objectHighlightStyle)

  // srcBlockId is stable across scene rebuilds (uuid is not), so a selection
  // survives a regen and re-attaches to the fresh objects here.
  const targets = useMemo(() => {
    if (!selectedBlockId) return []
    return objects.filter(
      (o) => o?.userData?.srcBlockId != null && String(o.userData.srcBlockId) === selectedBlockId
    )
  }, [objects, selectedBlockId])

  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.restore()
    activeRef.current = targets.length && enabled ? applyHighlight(style, targets, scene, size) : null
    invalidate()
    return () => {
      activeRef.current?.restore()
      activeRef.current = null
      invalidate()
    }
  }, [targets, enabled, style, scene, size, invalidate])

  // BLINK is the only style that animates; frameloop="demand" -> keep ticking.
  useFrame(({ clock }) => {
    const tick = activeRef.current?.tick
    if (!tick) return
    tick(clock.elapsedTime)
    invalidate()
  })

  return null
}
