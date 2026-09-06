import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import { OBJECT_HIGHLIGHT_STYLES, SELECTION_HIGHLIGHT_COLOR } from '@/store/highlightStyles'

// BLINK / GLOW highlight tuning. See docs/architecture/selection-and-picking.md.
const BLINK_MIN_OPACITY = 0.55
const BLINK_SPEED = 4 // rad/s -> ~1.5s period
const BLINK_TRANSPARENT_BOOST = 0.26
const BLINK_TRANSPARENT_MAX = 0.75
const GLOW_LIGHT_INTENSITY = 1.8
const GLOW_LIGHT_RANGE_FACTOR = 3 // kept tight so a big object's light doesn't flood the scene
const GLOW_SPRITE_RADIUS_FACTOR = 2.6
const GLOW_SPRITE_OPACITY = 0.7
const GLOW_EMISSIVE_INTENSITY = 0.2
const GLOW_RADIUS_MIN = 0.5
const GLOW_RADIUS_MAX = 4
const GLOW_RADIUS_REF = 1.5 // bigger objects dialled back (halo area grows r^2)
const GLOW_HEAD_RADIUS = 0.55
const GLOW_HEAD_TRAIL = 1.6
const GLOW_HEAD_EMISSIVE_INTENSITY = 0.28

const GLOW_PLANE_EDGE_LAYERS = [
  [0.05, 0.6],
  [0.2, 0.18],
]
const GLOW_PLANE_FILL_OPACITY = 0.42
const GLOW_PLANE_FILL_INNER = 0.32

// Radial white gradient, tinted per use. Built once, shared.
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

// Soft ring (halo around a silhouette, not a disc over it). Built once, shared.
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

// Opaque toward the edges, clear in the centre -- painted on a plane copy so
// the glow fills in from the border. Built once, shared.
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
      // Plane parts keep their own translucency.
      // See docs/architecture/selection-and-picking.md#blink-plane-exception.
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
    }),
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
    return true // blink always animates
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

// Union world-space bbox centre of `targets` into `out` (null if no bounds).
const GLOW_TICK_SCRATCH = new THREE.Vector3()
function unionBoxCenter(targets, out) {
  const box = new THREE.Box3()
  let ok = false
  targets.forEach((t) => {
    t.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(t)
    if (!b.isEmpty()) {
      box.union(b)
      ok = true
    }
  })
  if (!ok) return null
  box.getCenter(out)
  return out
}

// A camera-facing haze sprite at `center` (+ optional point light). Sprites
// cheap, lights not. See docs/architecture/selection-and-picking.md#selectionhighlight.
function addGlowAt(scene, accent, center, radius, strength, opts = {}) {
  const { withLight = true, ring = false, depthTest = true } = opts
  let light = null
  if (withLight) {
    light = new THREE.PointLight(
      accent,
      GLOW_LIGHT_INTENSITY * strength,
      radius * GLOW_LIGHT_RANGE_FACTOR,
      0,
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

// World-space tip + direction + visibility of every vector-shaft glyph in the
// subtree. See docs/architecture/selection-and-picking.md#stable-traversal-order.
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
      let visible = true
      for (let node = child; node; node = node.parent) {
        if (node.visible === false) {
          visible = false
          break
        }
      }
      heads.push({ tip, dir, visible })
    }),
  )
  return heads
}

function collectPlaneMeshes(targets) {
  const meshes = []
  targets.forEach((t) =>
    t.traverse((child) => {
      if (child.userData?.geoType === 'plane_mesh' && child.geometry) meshes.push(child)
    }),
  )
  return meshes
}

// A plane's border glow: bright edge line(s) + a texture-faded fill ramping
// in from the border. Parented onto the plane mesh so they track it.
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

  // Set by whichever glow path ran, so tick() can follow a moving object.
  //   follow      -- bbox path: { anchor, items:[{obj,offset}] }
  //   followHeads -- vector path: [{ head, trail }] parallel to collectVectorHeads
  let follow = null
  let followHeads = null

  if (planeMeshes.length) {
    // Hide the plane's own edge line first -- it sorts inconsistently and
    // peeks through. See docs/architecture/selection-and-picking.md#hide-plane-edge-line.
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
    // Vector(s): head ring + shaft trail + emissive bump. Softer per-head when
    // several share the selection.
    const strength = heads.length > 1 ? 0.75 : 1
    followHeads = []
    heads.forEach(({ tip, dir }) => {
      const headCenter = tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * 0.4)
      const head = addGlowAt(scene, accent, headCenter, GLOW_HEAD_RADIUS * 0.68, strength * 0.75, {
        ring: true,
        depthTest: false,
      })
      const trailPos = tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * GLOW_HEAD_TRAIL)
      const trail = addGlowAt(scene, accent, trailPos, GLOW_HEAD_RADIUS * 1.1, strength * 0.22, {
        withLight: false,
        depthTest: false,
      })
      parts.push(head, trail)
      followHeads.push({ head, trail })
    })

    // Bump the vector's own geometry so the halo reads as light off it.
    targets.forEach((t) =>
      t.traverse((child) => {
        if (child.userData?.thickenGroup !== 'vector' || child.visible === false) return
        materialsOf(child).forEach((m) => {
          if (!m || nudged.some((e) => e.m === m)) return
          if (m.emissive?.isColor) {
            nudged.push({
              m,
              emissive: m.emissive.clone(),
              emissiveIntensity: m.emissiveIntensity ?? 1,
            })
            m.emissive.copy(accent)
            m.emissiveIntensity = GLOW_HEAD_EMISSIVE_INTENSITY
          } else if (m.color?.isColor) {
            nudged.push({ m, color: m.color.clone() })
            m.color.lerp(accent, 0.15)
          }
          m.needsUpdate = true
        })
      }),
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
      // Bigger object -> a touch fainter.
      const strength = THREE.MathUtils.clamp(Math.sqrt(GLOW_RADIUS_REF / radius), 0.78, 1)
      const part = addGlowAt(scene, accent, sphere.center, radius, strength)
      parts.push(part)
      follow = { anchor: sphere.center.clone(), items: [] }
      ;[part.light, part.sprite].forEach((obj) => {
        if (obj) follow.items.push({ obj, offset: obj.position.clone().sub(sphere.center) })
      })
    }

    // A touch of emissive so the surface itself reads as lit from within.
    targets.forEach((t) =>
      t.traverse((child) => {
        materialsOf(child).forEach((m) => {
          if (!m?.emissive?.isColor || nudged.some((e) => e.m === m)) return
          nudged.push({
            m,
            emissive: m.emissive.clone(),
            emissiveIntensity: m.emissiveIntensity ?? 1,
          })
          m.emissive.copy(accent)
          m.emissiveIntensity = GLOW_EMISSIVE_INTENSITY
          m.needsUpdate = true
        })
      }),
    )
  }

  const moveGlowPart = (part, pos) => {
    let moved = false
    if (part.light && !part.light.position.equals(pos)) {
      part.light.position.copy(pos)
      moved = true
    }
    if (part.sprite && !part.sprite.position.equals(pos)) {
      part.sprite.position.copy(pos)
      moved = true
    }
    return moved
  }
  const setGlowPartVisible = (part, visible) => {
    let changed = false
    if (part.light && part.light.visible !== visible) {
      part.light.visible = visible
      changed = true
    }
    if (part.sprite && part.sprite.visible !== visible) {
      part.sprite.visible = visible
      changed = true
    }
    return changed
  }

  return {
    // Follow a moving/growing object. Returns true only on an actual change,
    // so an idle glow selection doesn't force the frameloop.
    tick: () => {
      if (follow) {
        const c = unionBoxCenter(targets, GLOW_TICK_SCRATCH)
        if (!c || c.equals(follow.anchor)) return false
        follow.anchor.copy(c)
        follow.items.forEach(({ obj, offset }) => obj.position.copy(c).add(offset))
        return true
      }
      if (followHeads) {
        const currentHeads = collectVectorHeads(targets)
        if (currentHeads.length !== followHeads.length) return false
        let changed = false
        currentHeads.forEach(({ tip, dir, visible }, i) => {
          const { head, trail } = followHeads[i]
          changed = setGlowPartVisible(head, visible) || changed
          changed = setGlowPartVisible(trail, visible) || changed
          if (!visible) return
          changed =
            moveGlowPart(head, tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * 0.4)) || changed
          changed =
            moveGlowPart(
              trail,
              tip.clone().addScaledVector(dir, -GLOW_HEAD_RADIUS * GLOW_HEAD_TRAIL),
            ) || changed
        })
        return changed
      }
      return false
    },
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

// Headless, mounted under <Scene>. See docs/architecture/selection-and-picking.md.
export default function SelectionHighlight({ objects = [] }) {
  const { scene, invalidate, size } = useThree()
  const selectedBlockId = useWorkspaceStore((s) => s.selectedBlockId)
  const enabled = useSettingsStore((s) => s.settings.objectHighlightEnabled)
  const style = useSettingsStore((s) => s.settings.objectHighlightStyle)

  // Matched by srcBlockId (stable across rebuilds, unlike uuid).
  const targets = useMemo(() => {
    if (!selectedBlockId) return []
    return objects.filter(
      (o) => o?.userData?.srcBlockId != null && String(o.userData.srcBlockId) === selectedBlockId,
    )
  }, [objects, selectedBlockId])

  const activeRef = useRef(null)

  useEffect(() => {
    activeRef.current?.restore()
    activeRef.current =
      targets.length && enabled ? applyHighlight(style, targets, scene, size) : null
    invalidate()
    return () => {
      activeRef.current?.restore()
      activeRef.current = null
      invalidate()
    }
  }, [targets, enabled, style, scene, size, invalidate])

  // frameloop="demand": tick returns whether it needs another frame.
  useFrame(({ clock }) => {
    if (activeRef.current?.tick?.(clock.elapsedTime)) invalidate()
  })

  return null
}
