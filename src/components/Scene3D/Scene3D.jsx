import React, { useMemo, useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react'
import { useThree, useFrame, Canvas } from '@react-three/fiber' // ADDED: useFrame
import { OrbitControls, Text, Billboard, Html, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
const THREE = { ...THREEBase, TeapotGeometry, Line2, LineGeometry, LineMaterial, LineSegments2, LineSegmentsGeometry }

import './Scene3D.css'
import useSettingsStore from '@/store/useSettingsStore'

const DEFAULT_CAMERA_POSITION = [0, 25, 50]
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(...DEFAULT_CAMERA_POSITION)
// Orbit zoom limits -- MIN keeps the camera from clipping through/inside
// objects when zooming in; MAX keeps the scene from shrinking into an
// unreadable speck (or disappearing entirely) when zooming out.
const MIN_CAMERA_DISTANCE = 2
const MAX_CAMERA_DISTANCE = 300
// Camera distance at which zoom-invariant meshes render at their authored
// (base) radius; they scale from there to keep apparent on-screen size
// constant, clamped by MIN/MAX_SCALE.
const ZOOM_INVARIANT_REFERENCE_DISTANCE = DEFAULT_CAMERA_OFFSET.length()
const ZOOM_INVARIANT_MIN_SCALE = 0.3
const ZOOM_INVARIANT_MAX_SCALE = 5
// "Extra Thick Lines" setting: flat multiplier on top of zoom-invariant
// scaling, for line/tube glyphs only (not point markers).
const EXTRA_THICK_LINE_MULTIPLIER = 2.7
const EXTRA_LARGE_POINT_MULTIPLIER = 1.6
// A flat 1.6x on top of ZOOM_INVARIANT_MAX_SCALE would let points balloon to
// 8x their base radius when zoomed far out -- capped closer to the normal
// max (5x) instead, so the multiplier mainly reads at everyday zoom levels.
const EXTRA_LARGE_POINT_MAX_SCALE = 5.5
// Clamp range for HeadLight's camera-relative offset scale (see below).
const HEADLIGHT_OFFSET_MIN_SCALE = 0.2
const HEADLIGHT_OFFSET_MAX_SCALE = 4
const DESMOS_TICK_COLOR = '#6b7280'
const AXIS_COLORS = {
  x: '#b56f6f',
  y: '#6f9b72',
  z: '#6f86b5',
}

function CameraHandle({ onReady }) {
  const { camera } = useThree();
  useEffect(() => { onReady?.(camera); }, [camera, onReady]);
  return null;
}

// Camera-following headlamp; matches the fixed point light's shadow
// settings. far kept well past the room's scale so no face's corners fall
// outside the shadow radius. A cube-map seam can still appear at some
// angles -- fixing that needs a single-frustum light type.
const HEADLIGHT_SHADOW_MIN_FAR = 280
const HEADLIGHT_SHADOW_FAR_MARGIN = 1.5

function HeadLight({ controlsRef }) {
  const lightRef = useRef();
  // Offset scales with camera-to-target distance (#57) so it stays a
  // small, consistent angle at any zoom instead of a fixed world vector.
  const offset = useMemo(() => new THREE.Vector3(1.5, 2.5, 0.5), []);

  useFrame(({ camera }) => {
    if (!lightRef.current) return;

    const target = controlsRef?.current?.target;
    const distance = target
      ? camera.position.distanceTo(target)
      : ZOOM_INVARIANT_REFERENCE_DISTANCE;
    const scale = THREE.MathUtils.clamp(
      distance / ZOOM_INVARIANT_REFERENCE_DISTANCE,
      HEADLIGHT_OFFSET_MIN_SCALE,
      HEADLIGHT_OFFSET_MAX_SCALE
    );
    const worldOffset = offset.clone().multiplyScalar(scale).applyQuaternion(camera.quaternion);
    lightRef.current.position.copy(camera.position).add(worldOffset);

    const shadowCam = lightRef.current.shadow.camera;
    shadowCam.far = Math.max(HEADLIGHT_SHADOW_MIN_FAR, distance * HEADLIGHT_SHADOW_FAR_MARGIN);
    shadowCam.updateProjectionMatrix();
  });

  return (
    <pointLight
      ref={lightRef}
      color="#fff4e0"
      intensity={2.5}
      decay={0}
      distance={0}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-bias={-0.001}
      shadow-camera-far={HEADLIGHT_SHADOW_MIN_FAR}
    />
  );
}

// Bounding box room: BackSide walls so the near ones cull automatically.
// An edge is hidden only when BOTH faces it borders are culled -- if just
// one side is open, the edge is still the visible rim of the other wall.
function cubeEdges(half) {
  return [
    // edges running along X (y,z fixed) -- border a Y-face and a Z-face
    { faces: ['NY', 'NZ'], a: [-half, -half, -half], b: [half, -half, -half] },
    { faces: ['NY', 'PZ'], a: [-half, -half, half], b: [half, -half, half] },
    { faces: ['PY', 'NZ'], a: [-half, half, -half], b: [half, half, -half] },
    { faces: ['PY', 'PZ'], a: [-half, half, half], b: [half, half, half] },
    // edges running along Y (x,z fixed) -- border an X-face and a Z-face
    { faces: ['NX', 'NZ'], a: [-half, -half, -half], b: [-half, half, -half] },
    { faces: ['NX', 'PZ'], a: [-half, -half, half], b: [-half, half, half] },
    { faces: ['PX', 'NZ'], a: [half, -half, -half], b: [half, half, -half] },
    { faces: ['PX', 'PZ'], a: [half, -half, half], b: [half, half, half] },
    // edges running along Z (x,y fixed) -- border an X-face and a Y-face
    { faces: ['NX', 'NY'], a: [-half, -half, -half], b: [-half, -half, half] },
    { faces: ['NX', 'PY'], a: [-half, half, -half], b: [-half, half, half] },
    { faces: ['PX', 'NY'], a: [half, -half, -half], b: [half, -half, half] },
    { faces: ['PX', 'PY'], a: [half, half, -half], b: [half, half, half] },
  ];
}

// A face is culled ("open") when the camera is beyond its plane.
function openFaces(cameraPosition, half) {
  const { x, y, z } = cameraPosition;
  return {
    PX: x > half, NX: x < -half,
    PY: y > half, NY: y < -half,
    PZ: z > half, NZ: z < -half,
  };
}

function BoundingBoxRoom({ size = 40, showFrontWireframe = true }) {
  const half = size / 2;
  const edges = useMemo(() => cubeEdges(half), [half]);
  const edgeRefs = useRef([]);

  useFrame(({ camera }) => {
    const open = showFrontWireframe ? null : openFaces(camera.position, half);
    edges.forEach((edge, i) => {
      const obj = edgeRefs.current[i];
      if (!obj) return;
      const [f1, f2] = edge.faces;
      obj.visible = !open || !(open[f1] && open[f2]);
    });
  });

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color="#ffffff" side={THREE.BackSide} roughness={1} />
      </mesh>
      {edges.map((edge, i) => (
        <line key={i} ref={(el) => { edgeRefs.current[i] = el; }}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([...edge.a, ...edge.b]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#a3a3a3" transparent opacity={0.42} depthWrite={false} />
        </line>
      ))}
    </group>
  );
}

function AxisArrow({ dir = [1, 0, 0], color = AXIS_COLORS.x, length = 3, opacity = 0.82, showLabel = true }) {
  const arrowGroup = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize()
    const group = new THREE.Group()
    // Emissive keeps the axis color readable from any angle/lighting (like
    // the old unlit MeshBasicMaterial did); roughness/metalness add the
    // lit specular highlight that makes it read as shiny instead of flat.
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    const headHeight = 0.62
    const shaftStart = -length
    const shaftEnd = length
    const shaftLength = Math.max(0.1, shaftEnd - shaftStart)
    // Kept under 0.0272 (the thinnest cylinder-based line glyph radius, see
    // geoVectorLine.js) so a coincident axis-aligned line still wins the
    // depth test against this shaft (#43).
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, shaftLength, 12), material)
    shaft.position.copy(direction).multiplyScalar((shaftStart + shaftEnd) / 2)
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, headHeight, 18), material)
    head.position.copy(direction).multiplyScalar(length - headHeight / 2)
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

    group.add(shaft, head)
    return group
  }, [dir, color, length, opacity])

  const tip = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize()
    return d.multiplyScalar(length + 0.55)
  }, [dir, length])

  return (
    <group>
      <primitive object={arrowGroup} />
      {showLabel && (
        <Billboard position={[tip.x, tip.y, tip.z]}>
          <Text fontSize={0.52} color={color} fillOpacity={opacity} anchorX="center" anchorY="middle">
            {dir[0] ? 'x' : dir[1] ? 'y' : 'z'}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

// Thin rings around the shaft at each unit interval, like a collar --
// visible from any camera angle, unlike a flat perpendicular tick would be.
// Reuses the same "ring around a cylinder" language as the collision-ring
// line accent (geoVectorLine.js).
function AxisTicks({ dir = [1, 0, 0], color = AXIS_COLORS.x, length = 3, step = 5, showLabels = true }) {
  const { ticksGroup, labelPositions } = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize()
    const perpOffset = dir[0] ? new THREE.Vector3(0, 0, 0.3) : new THREE.Vector3(0.3, 0, 0)
    const group = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 })
    const ringGeom = new THREE.TorusGeometry(0.05, 0.007, 8, 20)
    const positions = []

    for (let t = step; t <= length; t += step) {
      for (const sign of [1, -1]) {
        const at = t * sign
        const ring = new THREE.Mesh(ringGeom, material)
        ring.position.copy(direction).multiplyScalar(at)
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
        group.add(ring)
        positions.push({ t: at, pos: direction.clone().multiplyScalar(at).add(perpOffset) })
      }
    }

    return { ticksGroup: group, labelPositions: positions }
  }, [dir, color, length, step])

  return (
    <group>
      <primitive object={ticksGroup} />
      {showLabels && labelPositions.map(({ t, pos }) => (
        <Billboard key={t} position={[pos.x, pos.y, pos.z]}>
          <Text fontSize={0.3} color={color} fillOpacity={0.75} anchorX="center" anchorY="middle">
            {t}
          </Text>
        </Billboard>
      ))}
    </group>
  )
}

// A bare "0" sitting on the axis lines read as a stray digit, not a place --
// a small marker where the three axes cross reads as the origin on its own.
function OriginMarker({ radius = 0.06, color = DESMOS_TICK_COLOR, showLabel = false }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.15} />
      </mesh>
      {showLabel && (
        <Billboard position={[0.14, 0.14, 0]}>
          <Text fontSize={0.26} color={color} fillOpacity={0.85} anchorX="left" anchorY="bottom">
            O
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function Axes({ length = 3, showTicks = true, tickStep = 5, showOriginLabel = false, showScaleLabels = true, showEndLabels = true }) {
  return (
    <group>
      <OriginMarker showLabel={showOriginLabel} />
      <AxisArrow dir={[1, 0, 0]} color={AXIS_COLORS.x} length={length} opacity={0.82} showLabel={showEndLabels} />
      <AxisArrow dir={[0, 1, 0]} color={AXIS_COLORS.y} length={length} opacity={0.82} showLabel={showEndLabels} />
      <AxisArrow dir={[0, 0, 1]} color={AXIS_COLORS.z} length={length} opacity={0.82} showLabel={showEndLabels} />
      {showTicks && (
        <>
          <AxisTicks dir={[1, 0, 0]} color={AXIS_COLORS.x} length={length} step={tickStep} showLabels={showScaleLabels} />
          <AxisTicks dir={[0, 1, 0]} color={AXIS_COLORS.y} length={length} step={tickStep} showLabels={showScaleLabels} />
          <AxisTicks dir={[0, 0, 1]} color={AXIS_COLORS.z} length={length} step={tickStep} showLabels={showScaleLabels} />
        </>
      )}
    </group>
  )
}

const GRID_OPACITY = 0.18;

function FadedGrid() {
  const gridRef = useRef(null);

  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const materials = Array.isArray(gridRef.current.material)
      ? gridRef.current.material
      : [gridRef.current.material];

    materials.forEach((material, index) => {
      material.transparent = true;
      material.opacity = index === 0 ? Math.min(0.44, GRID_OPACITY * 1.7) : Math.min(0.28, GRID_OPACITY * 0.9);
      material.depthWrite = false;
      material.color.set(index === 0 ? 0xb0b0b0 : 0xd2d2d2);
      material.needsUpdate = true;
    });
  }, []);

  return (
    <gridHelper
      ref={gridRef}
      args={[40, 40, 0xb0b0b0, 0xd2d2d2]}
      position={[0, -0.005, 0]}
      renderOrder={-1}
    />
  );
}

function getObjectFocus(objects) {
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  let hasBounds = false;

  objects.forEach((object) => {
    if (!object?.isObject3D) return;
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!child.isObject3D || child.userData?.geoType === 'plane_mesh') return;
      if (!child.isMesh && !child.isLine && !child.isLineSegments) return;

      childBox.setFromObject(child);
      if (childBox.isEmpty()) return;
      box.union(childBox);
      hasBounds = true;
    });
  });

  if (!hasBounds) return null;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  return {
    center,
    radius: Math.max(size.x, size.y, size.z, 1) * 0.5,
  };
}

function fmtVec(v) {
  if (!v) return '[?, ?, ?]';
  const n = (x) => (Number.isFinite(x) ? +x.toFixed(3) : x);
  return `[${n(v.x)}, ${n(v.y)}, ${n(v.z)}]`;
}

// Accepts '#rrggbb' or 0xrrggbb and returns an rgba() string at the given alpha.
function hexToRgba(color, alpha) {
  const hex = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16);
  if (!Number.isFinite(hex)) return null;
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveAnchor(object3D, anchorName) {
  const ud = object3D.userData || {};

  if (anchorName === 'origin' && ud.origin) {
    const { x, y, z } = ud.origin;
    return [x, y, z];
  }
  if (anchorName === 'rPoint' && ud.rPoint) {
    const { x, y, z } = ud.rPoint;
    return [x, y, z];
  }

  const dict = ud.labelAnchors || {};
  const entry = dict[anchorName];
  if (!entry || !entry.position || entry.position.length !== 3) return null;

  const v = new THREE.Vector3(entry.position[0], entry.position[1], entry.position[2]);
  if (entry.type === 'local') {
    object3D.localToWorld(v);
  }
  return [v.x, v.y, v.z];
}

// Labels register here so LabelDeclutter can nudge overlapping ones apart
// each frame. Plain module-level registry, not React context: drei's <Html>
// mounts children into their own separate ReactDOM root, so context from
// above <Html> isn't visible inside it.
const labelRegistry = new Map();

// Labels scale gently with camera distance so they still feel "attached" to
// their object when you zoom, but the range is clamped tightly so they never
// shrink to illegible or balloon to distracting sizes.
const LABEL_SCALE_REF_DISTANCE = 56; // ~ default camera distance, so the initial view sits near scale 1
const LABEL_SCALE_MIN = 0.75;
const LABEL_SCALE_MAX = 1.25;

// Mass-spring label declutter constants. Each label is a point mass with a
// spring pulling it back toward a home position, plus continuous pairwise
// repulsion against other labels. Hand-tuned by feel -- same spirit as the
// LABEL_SCALE_* constants above, not derived exactly.
const SPRING_K = 450; // spring-to-home stiffness -- strong, so a label only drifts from its own anchor
                       // as much as truly necessary to clear another label, and snaps back close once
                       // clear (a weak spring let labels settle far from their anchor when two labels'
                       // homes happened to be close together on screen -- there was nothing pulling the
                       // pushed-out label back once it escaped the other's overlap zone).
const DAMPING_RATE = 20; // 1/s; velocity decays as exp(-DAMPING_RATE * t), independent of step size --
                          // scaled up alongside SPRING_K (roughly sqrt(k)) to stay critically damped
// Repulsion is linear in penetration depth and is exactly 0 the instant rects
// stop overlapping -- force must be 0 at the overlap/no-overlap boundary from
// BOTH sides, or the pair oscillates forever across that boundary (a label
// gets kicked out by a discontinuous jump, drifts back in under the spring,
// gets kicked out again, repeat). A separate "soft anticipatory" falloff zone
// for not-yet-overlapping labels was tried and removed for exactly this
// reason -- its force didn't go to 0 at the boundary, so it fought the
// overlap regime and never converged.
//
// The spring never stops pulling a label back toward its home, even once
// repulsion is active, so rest is wherever the two forces balance -- not
// wherever the rects stop overlapping. That equilibrium sits at a nonzero
// residual penetration unless repulsion heavily dominates the spring (a weak
// ratio like the original 900:140 settled with labels still visibly
// touching/overlapping, especially side-by-side where two wide text labels
// need a lot of horizontal separation to fully clear each other). Keeping
// REPEL_K_OVERLAP an order of magnitude above SPRING_K pushes that residual
// penetration down to near-zero without changing the convergence dynamics
// (still continuous/stable, just resolves overlap "harder").
const REPEL_K_OVERLAP = 7000; // repulsion per px of penetration once labels' rects truly overlap --
                               // raised alongside SPRING_K so repulsion still comfortably dominates
const MAX_PAIR_FORCE = 8000; // px/s^2 clamp per pair -- bounds single-step impulses (avoids overshoot
                              // when two labels start out fully coincident, e.g. two labels on one anchor)
const GAP = 8; // px; visual gap once rects stop overlapping
// Force is 0 exactly at the overlap/no-overlap boundary (a single point), so
// sub-pixel float/discretization noise right at that point can flip a label
// between "just barely overlapping" and "just barely clear" every sub-step,
// injecting a tiny force each time -- visible as a persistent low-amplitude
// hover that never fully settles. Shifting the zero-force point outward by a
// couple px turns that single point into a small band, so noise within it
// stays force-free and velocity actually decays to a true, unmoving rest.
const FORCE_DEADZONE = 2; // px
const MAX_OFFSET = 55; // px; hard cap on how far a label can ever drift from its anchor
const EMPHASIS_MASS = 2.5; // emphasis labels resist being pushed more, so they "win" contested space
const MAX_DT = 0.05; // seconds; caps a single frame's step (e.g. after a backgrounded tab regains focus)
// Sub-step count is derived from the frame's dt (below), not fixed, so it stays
// robust across very different refresh rates -- a fixed count tuned for 60fps
// (small per-frame dt) was too coarse on a slow/throttled display where each
// frame's dt is much larger, close to MAX_DT, and needs proportionally more
// subdivision for the same stability.
const TARGET_SUBSTEP_DT = 0.006; // seconds; each sub-step aims for roughly this duration
const SLEEP_VELOCITY = 3; // px/s; velocity below this is snapped to 0 so near-equilibrium labels come
                           // to a true, exact rest instead of perpetually creeping by sub-pixel amounts
                           // (that creep was invisible in the settle-time numbers but visible on screen
                           // once labels update every frame instead of every ~50ms).

// A label's spring rests at a small, fixed *screen-space* offset from its raw
// anchor projection -- never (0,0). A label's world-space authoring offset
// (see LabelLayer's `offset`) can project to ~zero screen displacement from
// some camera angles (the offset vector pointing roughly along the view
// direction), which lets the label render directly on top of -- occluding --
// the object it's labeling. A fixed screen-space offset can't do that: it's
// applied after projection, so it's the same up-and-right nudge regardless of
// camera angle, guaranteeing minimum separation from the marker.
const BASE_OFFSET_DIST = 16; // px
const BASE_OFFSET_ANGLE = -40 * Math.PI / 180; // up + right (CSS Y grows downward)
const BASE_OFFSET_X = BASE_OFFSET_DIST * Math.cos(BASE_OFFSET_ANGLE);
const BASE_OFFSET_Y = BASE_OFFSET_DIST * Math.sin(BASE_OFFSET_ANGLE);

// Exact "just touching" center distance for two axis-aligned rects along a
// given direction (nx, ny) -- the Minkowski-sum boundary of the two rects is
// itself a rectangle with these combined half-extents, so the distance to its
// edge along a ray is whichever axis the ray exits first.
function minkowskiSafeDist(nx, ny, combinedHalfWidth, combinedHalfHeight) {
  const tX = Math.abs(nx) > 1e-6 ? combinedHalfWidth / Math.abs(nx) : Infinity;
  const tY = Math.abs(ny) > 1e-6 ? combinedHalfHeight / Math.abs(ny) : Infinity;
  return Math.min(tX, tY);
}

function LabelAnchor({ id, className, color, worldPos, emphasis, children }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    const entry = {
      bodyRef,
      worldPos,
      offsetX: 0,
      offsetY: 0,
      velX: 0,
      velY: 0,
      appliedScale: 1,
      mass: emphasis ? EMPHASIS_MASS : 1,
    };
    labelRegistry.set(id, entry);
    applyLabelTransform(entry, 0, 0, 1);
    return () => { labelRegistry.delete(id); };
  }, [id]);

  useEffect(() => {
    const entry = labelRegistry.get(id);
    if (!entry) return;
    entry.worldPos = worldPos;
    entry.mass = emphasis ? EMPHASIS_MASS : 1;
    // Anchor jumped (scene rebuild) -- kill velocity to avoid a flick, but
    // keep offsetX/offsetY as a warm start since the relative clutter
    // situation is usually similar across rebuilds.
    entry.velX = 0;
    entry.velY = 0;
  }, [id, worldPos, emphasis]);

  const background = color ? hexToRgba(color, 0.55) : undefined;

  return (
    <div className="label-anchor">
      <div ref={bodyRef} className={className} style={background ? { backgroundColor: background } : undefined}>
        {children}
      </div>
    </div>
  );
}

function applyLabelTransform(entry, x, y, scale) {
  entry.offsetX = x;
  entry.offsetY = y;
  entry.appliedScale = scale;
  if (entry.bodyRef.current) {
    const parts = [];
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) parts.push(`translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`);
    if (Math.abs(scale - 1) > 0.01) parts.push(`scale(${scale.toFixed(3)})`);
    // translate3d must come before scale: a CSS transform list applies right-to-left,
    // so this keeps the translation in true screen pixels, independent of scale.
    // Swapping the order would make MAX_OFFSET/GAP/REPEL_* scale-dependent -- don't "clean it up".
    entry.bodyRef.current.style.transform = parts.join(' ');
  }
}

function LabelDeclutter() {
  const scratchVec = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    // Runs every rendered frame (not throttled to a fixed tick rate) so label
    // motion matches the rest of the scene -- updating position on a coarser
    // cadence than the render loop looked stepped/jittery next to everything
    // else moving at full frame rate. Sub-stepping (below) keeps the physics
    // stable regardless of how big or small this frame's dt is.
    const dt = Math.min(delta, MAX_DT);

    const entries = Array.from(labelRegistry.values())
      .filter((e) => e.bodyRef.current);

    // Pass 1: camera-distance scale (unchanged logic, independent of position)
    entries.forEach((e) => {
      if (!e.worldPos) return;
      const dist = scratchVec.current.set(e.worldPos[0], e.worldPos[1], e.worldPos[2]).distanceTo(camera.position);
      const rawScale = LABEL_SCALE_REF_DISTANCE / Math.max(dist, 1e-3);
      const targetScale = Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, rawScale));
      e.appliedScale += (targetScale - e.appliedScale) * 0.25;
    });

    // Pass 2: read (batch all DOM reads before any writes, avoid layout thrash).
    // Geometry (_cx/_cy/_hw/_hh) is only valid for this outer tick -- offsets
    // move within it below, but rect size/natural-center don't change without
    // a fresh DOM read, so they're computed once per tick, not per sub-step.
    entries.forEach((e) => {
      const rect = e.bodyRef.current.getBoundingClientRect();
      e._cx = rect.left + rect.width / 2 - e.offsetX; // natural (un-offset) center
      e._cy = rect.top + rect.height / 2 - e.offsetY;
      e._hw = rect.width / 2;
      e._hh = rect.height / 2;
    });

    // Passes 3-5: force + integrate, in several small sub-steps rather than
    // one single frame-sized step. A single step can still be too coarse
    // relative to how stiff the repulsion force can get when several labels
    // overlap at once (summed pairwise forces can move a label further in
    // one step than the separation being resolved) -- that overshoot was
    // itself a second source of the flicker, independent of the force
    // continuity fixed by REPEL_K_OVERLAP-only repulsion above. Sub-stepping
    // is the standard fix for a stiff force / coarse-timestep mismatch.
    const substeps = Math.max(1, Math.ceil(dt / TARGET_SUBSTEP_DT));
    const subDt = dt / substeps;
    const velDecay = Math.exp(-DAMPING_RATE * subDt);
    for (let step = 0; step < substeps; step++) {
      entries.forEach((e) => {
        // Spring-to-home force (home = a fixed screen-space nudge, not (0,0) -- see BASE_OFFSET_*)
        e._fx = -SPRING_K * (e.offsetX - BASE_OFFSET_X);
        e._fy = -SPRING_K * (e.offsetY - BASE_OFFSET_Y);
      });

      // Pairwise repulsion, O(n^2) -- fine at label counts of a few dozen.
      // Force always points along the line between the two centers (continuous
      // in direction) -- unlike an axis-locked "push whichever of X/Y overlaps
      // less" rule, this can't flip discretely between push-X and push-Y mode
      // as the offsets shift, which is what caused visible flicker.
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i];
          const b = entries[j];
          const ax = a._cx + a.offsetX, ay = a._cy + a.offsetY;
          const bx = b._cx + b.offsetX, by = b._cy + b.offsetY;
          let dx = ax - bx;
          let dy = ay - by;
          let dist = Math.hypot(dx, dy);

          if (dist < 1e-3) {
            // Perfectly coincident (common when multiple labels share one
            // anchor) -- fan out in a deterministic direction per pair instead
            // of an unstable/arbitrary one.
            const angle = i * 2.399963 + j * 0.618034;
            dx = Math.cos(angle); dy = Math.sin(angle); dist = 1;
          }

          const nx = dx / dist;
          const ny = dy / dist;
          const combinedHW = a._hw + b._hw + GAP;
          const combinedHH = a._hh + b._hh + GAP;
          // Zero-force point shifted outward by FORCE_DEADZONE -- see its comment.
          const safeDist = minkowskiSafeDist(nx, ny, combinedHW, combinedHH) - FORCE_DEADZONE;

          // Rects truly overlap -- linear in penetration depth, 0 exactly at
          // dist === safeDist (see REPEL_K_OVERLAP comment for why that matters).
          let mag = dist < safeDist ? REPEL_K_OVERLAP * (safeDist - dist) : 0;

          if (mag > 0) {
            mag = Math.min(mag, MAX_PAIR_FORCE);
            a._fx += nx * mag; a._fy += ny * mag;
            b._fx -= nx * mag; b._fy -= ny * mag;
          }
        }
      }

      // Integrate (semi-implicit Euler) + damping + clamp for this sub-step
      entries.forEach((e) => {
        e.velX = (e.velX + (e._fx / e.mass) * subDt) * velDecay;
        e.velY = (e.velY + (e._fy / e.mass) * subDt) * velDecay;
        if (Math.hypot(e.velX, e.velY) < SLEEP_VELOCITY) { e.velX = 0; e.velY = 0; }
        e.offsetX += e.velX * subDt;
        e.offsetY += e.velY * subDt;

        const mag = Math.hypot(e.offsetX, e.offsetY);
        if (mag > MAX_OFFSET) {
          const s = MAX_OFFSET / mag;
          e.offsetX *= s; e.offsetY *= s;
          e.velX *= 0.5; e.velY *= 0.5; // bleed velocity at the clamp so it doesn't buzz against the wall
        }
      });
    }

    entries.forEach((e) => applyLabelTransform(e, e.offsetX, e.offsetY, e.appliedScale));
  });

  return null;
}

function getLabelVisibilityKey(labelIdBase, lbl, index) {
  return `${labelIdBase}:${lbl.anchor ?? index}:${index}`;
}

function LabelLayer({ object3D, hiddenLabelKeys }) {
  const ud = object3D.userData || {};
  const labels = Array.isArray(ud.labels) ? ud.labels : [];
  // srcBlockId stays stable across scene regenerations (uuid doesn't), so
  // labels keep their identity and settled position across edits.
  const labelIdBase = ud.srcBlockId ?? object3D.uuid;

  const needsDefault = labels.length === 0 && ud.geoType === 'geo_vector_line';
  const derived = needsDefault
    ? [
      { anchor: 'origin', text: `Pos ${fmtVec(ud.origin)}`, distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#2563eb' },
      ...(ud.rPoint != null && Number.isFinite(ud.t)
        ? [{ anchor: 'rPoint', text: `r(t=${ud.t}) ${fmtVec(ud.rPoint)}`, distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#ffff00' }]
        : []),
    ]
    : labels;

  return (
    <>
      {derived.map((lbl, i) => {
        if (hiddenLabelKeys?.has(getLabelVisibilityKey(labelIdBase, lbl, i))) return null;

        const pos = resolveAnchor(object3D, lbl.anchor);
        if (!pos) return null;

        const off = Array.isArray(lbl.offset) && lbl.offset.length === 3 ? lbl.offset : [0, 0, 0];

        let text = lbl.text;
        if (!text) {
          const val =
            lbl.anchor === 'origin' ? ud.origin :
              lbl.anchor === 'rPoint' ? ud.rPoint :
                null;
          const fmt = lbl.format || 'vec';
          if (fmt === 'vec' && val) text = fmtVec(val);
          else if (fmt === 'raw' && val) text = String(val);
          else text = '';
        }

        const worldPos = [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]];

        return (
          <group key={`lbl-${i}`} position={worldPos}>
            <Html>
              <LabelAnchor
                id={`${labelIdBase}-${i}`}
                className={`label${lbl.emphasis ? ' label--emphasis' : ''}${lbl.className ? ` ${lbl.className}` : ''}`}
                color={lbl.className ? undefined : lbl.color}
                worldPos={worldPos}
                emphasis={!!lbl.emphasis}
              >
                {text}
              </LabelAnchor>
            </Html>
          </group>
        );
      })}
    </>
  );
}

function findSelectablePointMarker(object) {
  let target = object;
  while (target) {
    if (target.userData?.geoType === 'selectable_point_marker') return target;
    target = target.parent;
  }
  return null;
}

function findToggleablePointLabelKey(marker) {
  let target = marker;
  while (target) {
    const labels = Array.isArray(target.userData?.labels) ? target.userData.labels : [];
    const labelIndex = labels.findIndex((label) => label?.anchor === 'q');
    if (labelIndex !== -1) {
      const labelIdBase = target.userData?.srcBlockId ?? target.uuid;
      return getLabelVisibilityKey(labelIdBase, labels[labelIndex], labelIndex);
    }
    target = target.parent;
  }
  return null;
}

function SelectablePointPicker({ onTogglePointLabel }) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (event) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const marker = hits.map((hit) => findSelectablePointMarker(hit.object)).find(Boolean);

      if (!marker) return;

      event.stopPropagation();
      const labelKey = findToggleablePointLabelKey(marker);
      if (labelKey) onTogglePointLabel(labelKey);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, gl, onTogglePointLabel, pointer, raycaster, scene]);

  return null;
}

const globalThreeObjStore = {}

// Nested transparent objects have near-coincident bounding centers, so
// per-frame distance-sort order flickers with camera jitter. Derive a
// stable renderOrder from bounding-box containment instead: an object
// always renders after whatever encloses it.
function computeNestingRenderOrders(objects) {
  const boxes = objects.map((o) => {
    if (!o?.isObject3D) return null;
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    return box.isEmpty() ? null : box;
  });

  return objects.map((_, i) => {
    if (!boxes[i]) return 0;
    let containedByCount = 0;
    boxes.forEach((box, j) => {
      if (j === i || !box) return;
      if (box.containsBox(boxes[i]) && !boxes[i].containsBox(box)) {
        containedByCount += 1;
      }
    });
    // More containers wrapping this object -> render earlier (further back).
    return -containedByCount;
  });
}

// Skips invisible subtrees (e.g. geo_vector_line's hidden glyph-style
// siblings) so they don't get a scale computation every frame for nothing.
function traverseVisible(object3D, callback) {
  if (object3D.visible === false) return;
  callback(object3D);
  object3D.children.forEach((child) => traverseVisible(child, callback));
}

// Applies zoom-invariant scaling and/or a size multiplier to meshes tagged
// with userData.zoomInvariantRadius. Both multipliers apply regardless of
// whether zoom-invariant sizing is on, and are mutually exclusive by glyph
// kind: extraThick for line/tube glyphs, extraLargePoints for point markers
// (userData.zoomInvariantUniform).
function ZoomInvariantScaler({ objects, zoomEnabled, extraThick, extraLargePoints }) {
  const worldPos = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    objects.forEach((o) => {
      if (!o) return;

      // ONE distance -- and so one zoomScale -- per TOP-LEVEL object, not
      // one independently computed per zoom-invariant child. A multi-piece
      // glyph (a dashed/ringed line's many small tube/ring segments) needs
      // to scale as a single uniform unit, the way a texture moves with its
      // surface; letting each piece compute its own correction from its own
      // world position made segments at different camera distances end up
      // visibly different sizes -- a bulging/tapering artifact on any line
      // long enough (or viewed end-on enough) that its pieces sit at
      // meaningfully different distances from the camera. Lines expose
      // userData.segmentMid (their own local-space centre) as a stable
      // single reference point for this; anything else just uses its own
      // world position, which is what already happened per-child before.
      let zoomScale = 1;
      if (zoomEnabled) {
        if (o.userData?.segmentMid) {
          o.updateMatrixWorld();
          worldPos.copy(o.userData.segmentMid).applyMatrix4(o.matrixWorld);
        } else {
          o.getWorldPosition(worldPos);
        }
        const distance = camera.position.distanceTo(worldPos);
        zoomScale = THREE.MathUtils.clamp(
          distance / ZOOM_INVARIANT_REFERENCE_DISTANCE,
          ZOOM_INVARIANT_MIN_SCALE,
          ZOOM_INVARIANT_MAX_SCALE
        );
      }

      traverseVisible(o, (child) => {
        const baseRadius = child.userData?.zoomInvariantRadius;
        if (!baseRadius) return;
        const isUniform = !!child.userData.zoomInvariantUniform;

        const thickMultiplier = isUniform
          ? (extraLargePoints ? EXTRA_LARGE_POINT_MULTIPLIER : 1)
          : (extraThick ? EXTRA_THICK_LINE_MULTIPLIER : 1);
        let finalScale = zoomScale * thickMultiplier;
        if (isUniform && extraLargePoints) {
          finalScale = Math.min(finalScale, EXTRA_LARGE_POINT_MAX_SCALE);
        }

        if (isUniform) {
          child.scale.setScalar(finalScale);
        } else {
          child.scale.set(finalScale, 1, finalScale);
        }
      });
    });
  });

  return null;
}

// Keeps each geo_vector_line's dash/ring collision-accent patterns
// (userData.updateZoomRatio, see geoVectorLine.js) in sync with camera
// distance -- geoVectorLineDefinition builds the glyph once, up front, with
// no access to the camera, so re-deriving the dash/ring count as the user
// zooms has to happen here instead. Passes the raw (unclamped) distance
// ratio rather than a pre-clamped scale -- dashes and rings each want their
// own clamp range (dashes read fine over a narrow range; a fine "ring
// texture" needs to grow much more at extreme zoom-out to stay legible), so
// that tuning lives entirely in geoVectorLine.js instead of being split
// across two files.
function DashZoomSync({ objects, zoomEnabled }) {
  const worldMid = useMemo(() => new THREE.Vector3(), []);

  // Explicit priority -1 (lower runs earlier) so this always runs BEFORE
  // ZoomInvariantScaler in the same frame, not just by JSX/mount-order
  // coincidence. It matters here specifically: rebuilding the dash pattern
  // creates brand-new Mesh children with an unset (1,1,1) scale, and
  // ZoomInvariantScaler is what corrects that to the right zoom-invariant
  // cross-section radius. If it ran first (or in an unspecified order),
  // those new segments would render at their raw, un-scaled radius for one
  // frame every time the pattern rebuilds -- a visible thickness flicker
  // during a continuous zoom, since rebuilds happen repeatedly as the scale
  // crosses each threshold.
  useFrame(({ camera }) => {
    if (!zoomEnabled) return;
    objects.forEach((o) => {
      if (!o?.userData?.updateZoomRatio || !o.userData.segmentMid) return;
      o.updateMatrixWorld();
      worldMid.copy(o.userData.segmentMid).applyMatrix4(o.matrixWorld);
      const distance = camera.position.distanceTo(worldMid);
      o.userData.updateZoomRatio(distance / ZOOM_INVARIANT_REFERENCE_DISTANCE);
    });
  }, -1);

  return null;
}

// Syncs Line2/LineMaterial glyphs with canvas resolution (for correct pixel
// linewidth) and the extra-thick multiplier -- neither is available to
// geoVectorLine.js at construction time.
function FatLineSync({ objects, extraThick }) {
  const { size } = useThree();

  useEffect(() => {
    objects.forEach((o) => {
      if (!o) return;
      o.traverse((child) => {
        if (!child.userData?.isFatLine || !child.material) return;
        child.material.resolution.set(size.width, size.height);
        const baseWidth = child.userData.fatLineBaseWidth || 1;
        child.material.linewidth = baseWidth * (extraThick ? EXTRA_THICK_LINE_MULTIPLIER : 1);
      });
    });
  }, [objects, size.width, size.height, extraThick]);

  return null;
}

function Scene({ objects = [], hiddenLabelKeys, controlsRef }) {
  const { settings } = useSettingsStore()

  useEffect(() => {
    objects.forEach((o) => {
      if (!o) return;
      o.traverse((child) => {
        if (child.isMesh) child.receiveShadow = settings.objectsReceiveShadows;
      });
    });
  }, [objects, settings.objectsReceiveShadows]);

  useEffect(() => {
    const renderOrders = computeNestingRenderOrders(objects);
    objects.forEach((o, i) => {
      if (!o) return;
      const order = renderOrders[i];
      o.traverse((child) => {
        if (child.isMesh || child.isLine || child.isLineSegments) {
          child.renderOrder = order;
        }
      });
    });
  }, [objects]);

  return (
    <>
      <ZoomInvariantScaler
        objects={objects}
        zoomEnabled={settings.zoomInvariantSizing}
        extraThick={settings.extraThickLines}
        extraLargePoints={settings.extraLargePoints}
      />
      <FatLineSync objects={objects} extraThick={settings.extraThickLines} />
      <DashZoomSync objects={objects} zoomEnabled={settings.zoomInvariantSizing} />
      <LabelDeclutter />
      <ambientLight intensity={0.4} />

      {/* 1. The Headlight (Camera Light) */}
      <HeadLight controlsRef={controlsRef} />

      {/* 2. The Point Light */}
      <pointLight
        position={[8, 18, 0]}
        color="#fff4e0"
        intensity={2.5}
        decay={0}
        distance={100}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.001}
      />

      {settings.showGrid && (
        <FadedGrid />
      )}

      {settings.showBox && (
        <BoundingBoxRoom size={40} showFrontWireframe={settings.showBoxFrontWireframe} />
      )}

      {settings.showAxes && (
        <Axes
          length={20}
          showOriginLabel={settings.showOriginLabel}
          showScaleLabels={settings.showAxisScaleLabels}
          showEndLabels={!settings.showAxisGizmo}
        />
      )}

      {objects.map((o, i) => {
        if (!o) return null;
        return (
          <group key={i}>
            {/* MAKE SURE: The objects you feed into this array have `castShadow`
                set on their meshes, or they won't cast shadows! `receiveShadow` is
                managed above based on settings.objectsReceiveShadows. */}
            <primitive object={o} />
            {settings.showLabels && <LabelLayer object3D={o} hiddenLabelKeys={hiddenLabelKeys} />}
          </group>
        );
      })}
    </>
  );
}

// Placeholder until real dark mode support lands.
const SCENE_BACKGROUND_COLOR = '#ffffff'

export default function Scene3D({ objects = [] }) {
  const { settings, updateSetting } = useSettingsStore()
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const focusRef = useRef({ center: new THREE.Vector3(0, 0, 0), radius: 20 });
  const didInitialFocusRef = useRef(false);
  const prevObjectCountRef = useRef(0);
  const [hiddenLabelKeys, setHiddenLabelKeys] = useState(() => new Set());
  // cameraRef/controlsRef populate async (R3F's own render loop), after the
  // first `objects` update can already have fired; bump this once they're
  // ready so the auto-frame effect below retries immediately instead of
  // waiting on the next unrelated block edit.
  const [refsReadyTick, setRefsReadyTick] = useState(0);

  useLayoutEffect(() => {
    window.THREE = THREE
    window.threeObjStore = globalThreeObjStore

    return () => {
      delete window.THREE
      delete window.threeObjStore
    }
  }, []);

  // Auto-frame on first load and on new-object-added only (not on move/edit
  // of existing objects), gated behind settings.autoFocusOnNewObject.
  useEffect(() => {
    if (!settings.autoFocusOnNewObject) return;

    const focus = getObjectFocus(objects);
    if (!focus) return;

    focusRef.current = focus;

    const isNewObjectAdded = objects.length > prevObjectCountRef.current;
    const isFirstFocus = !didInitialFocusRef.current;
    prevObjectCountRef.current = objects.length;

    if (!cameraRef.current || !controlsRef.current) return;
    if (!isFirstFocus && !isNewObjectAdded) return;
    didInitialFocusRef.current = true;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const oldTarget = controls.target.clone();
    const oldOffset = camera.position.clone().sub(oldTarget);
    const offset = oldOffset.lengthSq() > 1e-8
      ? oldOffset
      : DEFAULT_CAMERA_OFFSET.clone();
    const minDistance = Math.max(focusRef.current.radius * 2.6, 8);

    if (offset.length() < minDistance) offset.setLength(minDistance);
    controls.target.copy(focusRef.current.center);
    camera.position.copy(focusRef.current.center).add(offset);
    controls.update();
  }, [objects, refsReadyTick, settings.autoFocusOnNewObject]);

  const resetDefaultView = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(...DEFAULT_CAMERA_POSITION);
    cameraRef.current.up.set(0, 1, 0);
    cameraRef.current.zoom = 1;
    cameraRef.current.updateProjectionMatrix();
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleTogglePointLabel = useCallback((labelKey) => {
    setHiddenLabelKeys((current) => {
      const next = new Set(current);
      if (next.has(labelKey)) next.delete(labelKey);
      else next.add(labelKey);
      return next;
    });
  }, []);

  return (
    <div className="editor-body-3d">
      <div className="relative flex-1 min-h-0">
        <Canvas
          shadows
          camera={{ position: DEFAULT_CAMERA_POSITION, fov: 45, near: 0.1, far: 5000 }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <OrbitControls
            makeDefault
            minDistance={MIN_CAMERA_DISTANCE}
            maxDistance={MAX_CAMERA_DISTANCE}
            ref={(instance) => {
              controlsRef.current = instance;
              if (instance) setRefsReadyTick((tick) => tick + 1);
            }}
          />
          <CameraHandle
            onReady={(cam) => {
              cameraRef.current = cam;
              setRefsReadyTick((tick) => tick + 1);
            }}
          />
          <SelectablePointPicker onTogglePointLabel={handleTogglePointLabel} />
          <Scene objects={objects} hiddenLabelKeys={hiddenLabelKeys} controlsRef={controlsRef} />
          <color attach="background" args={[SCENE_BACKGROUND_COLOR]} />
          {/* Screen-space orientation gizmo -- an alternative to the in-scene
              axes that doesn't take up world space; the in-scene axes can be
              hidden via the toggle below and this still shows X/Y/Z. */}
          {settings.showAxisGizmo && (
            <GizmoHelper alignment="top-right" margin={[56, 56]}>
              <GizmoViewport axisColors={[AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z]} labelColor="black" />
            </GizmoHelper>
          )}
        </Canvas>
        <div className="scene-view-controls">
          {/* Any additional buttons stack above Reset View, which stays
              pinned in the true bottom-right corner. */}
          {settings.showAxisToggleButton && (
            <button
              className={`scene-view-btn${settings.showAxes ? ' scene-view-btn--active' : ''}`}
              onClick={() => updateSetting('showAxes', !settings.showAxes)}
              aria-label={settings.showAxes ? 'Hide axes' : 'Show axes'}
              title={settings.showAxes ? 'Hide axes' : 'Show axes'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M12 21V5M12 5l-4 4M12 5l4 4M21 12H5M5 12l4-4M5 12l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button
            className="scene-view-btn"
            onClick={resetDefaultView}
            aria-label="Reset to default 3D view"
            title="Default view"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
