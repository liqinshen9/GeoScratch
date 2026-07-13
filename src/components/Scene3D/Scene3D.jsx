import React, { useMemo, useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react'
import { useThree, useFrame, Canvas } from '@react-three/fiber' // ADDED: useFrame
import { Edges, OrbitControls, Text, Billboard, Html } from '@react-three/drei'
import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
const THREE = { ...THREEBase, TeapotGeometry }

import './Scene3D.css'
import useSettingsStore from '@/store/useSettingsStore'
import { createStyledArrow } from '@/utils/styledArrow'

const DEFAULT_CAMERA_POSITION = [0, 25, 50]

function CameraHandle({ onReady }) {
  const { camera } = useThree();
  useEffect(() => { onReady?.(camera); }, [camera, onReady]);
  return null;
}

// --- ADDED: Camera Headlight ---
// This light acts like a miner's headlamp. It syncs its position
// with the camera every frame so it always illuminates what you look at.
// It's a pointLight (not a spotLight) so its shadow is an omnidirectional
// cube map, just like the scene's other point light — no target/frustum
// aiming math required, and no risk of the shadow cone drifting off-axis
// as the camera orbits.
function HeadLight() {
  const lightRef = useRef();
  // Small, mostly-vertical offset: enough to break line-of-sight occlusion,
  // not enough to throw the shadow noticeably off to one side.
  const offset = useMemo(() => new THREE.Vector3(1.5, 2.5, 0.5), []);

  useFrame(({ camera }) => {
    if (lightRef.current) {
      const worldOffset = offset.clone().applyQuaternion(camera.quaternion);
      lightRef.current.position.copy(camera.position).add(worldOffset);
    }
  });

  return (
    <pointLight
      ref={lightRef}
      color="#fff4e0"
      intensity={2.5}
      decay={0}
      distance={300}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-bias={-0.001}
    />
  );
}

// --- ADDED: Bounding Box Room ---
// A giant cube that renders on the inside to catch all shadows
// --- FIXED: Bounding Box Room ---
function BoundingBoxRoom({ size = 40 }) {
  return (
    // Centered exactly back at [0, 0, 0]
    <mesh position={[0, 0, 0]} receiveShadow>
      <boxGeometry args={[size, size, size]} />

      {/* BackSide hides the front faces but catches shadows on the back walls/floor */}
      <meshStandardMaterial
        color="#52525b"
        side={THREE.BackSide}
        roughness={1}
      />
    </mesh>
  );
}

const AxisLabels = ({ size = 40, step = 1, y = 0.01, fontSize = 0.25, color = '#9aa0a6', showZero = true }) => {
  const ticks = useMemo(() => Array.from({ length: Math.floor(size / step) + 1 }, (_, i) => i * step - size / 2), [size, step]);
  return (
    <group>
      {ticks.map(t => (showZero || t !== 0) && (
        <Billboard key={`x-${t}`} position={[t, y, 0]}>
          <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle">{t}</Text>
        </Billboard>
      ))}
      {ticks.map(t => (showZero || t !== 0) && (
        <Billboard key={`z-${t}`} position={[0, y, t]}>
          <Text fontSize={fontSize} color={color} anchorX="center" anchorY="middle">{t}</Text>
        </Billboard>
      ))}
    </group>
  );
};

function AxisArrow({ dir = [1, 0, 0], color = 'red', length = 3 }) {
  const arrow = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize()
    const origin = new THREE.Vector3(0, 0, 0)
    const helper = createStyledArrow(THREE, direction, origin, length, new THREE.Color(color), 0.1, 0.1)
    return helper
  }, [dir, color, length])

  const tip = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize()
    return d.multiplyScalar(length + 0.25)
  }, [dir, length])

  return (
    <group>
      <primitive object={arrow} />
      <Billboard position={[tip.x, tip.y, tip.z]}>
        <Text fontSize={0.35} color={color} anchorX="center" anchorY="middle">
          {dir[0] ? 'X' : dir[1] ? 'Y' : 'Z'}
        </Text>
      </Billboard>
    </group>
  )
}

function Axes({ length = 3 }) {
  return (
    <group>
      <AxisArrow dir={[1, 0, 0]} color="#ef4444" length={length} />
      <AxisArrow dir={[0, 1, 0]} color="#22c55e" length={length} />
      <AxisArrow dir={[0, 0, 1]} color="#3b82f6" length={length} />
    </group>
  )
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

// --- Label decluttering ---
// Every rendered label registers its DOM nodes here so LabelDeclutter (mounted
// once per Scene) can read their real screen rects each frame and nudge any
// that overlap apart, so stacked/close labels stay readable instead of piling
// up on top of each other as the camera moves.
//
// This is a plain module-level registry rather than React context: drei's
// <Html> mounts its children into their own independent ReactDOM root (see
// its source), which is a separate React tree with no ancestors — any
// context provided above <Html> in the Canvas tree is invisible inside it.
// A shared JS reference sidesteps that entirely.
const labelRegistry = new Map();

// Labels scale gently with camera distance so they still feel "attached" to
// their object when you zoom, but the range is clamped tightly so they never
// shrink to illegible or balloon to distracting sizes.
const LABEL_SCALE_REF_DISTANCE = 56; // ~ default camera distance, so the initial view sits near scale 1
const LABEL_SCALE_MIN = 0.75;
const LABEL_SCALE_MAX = 1.25;

function LabelAnchor({ id, className, color, worldPos, children }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    const entry = { bodyRef, appliedY: 0, appliedScale: 1, worldPos };
    labelRegistry.set(id, entry);
    return () => { labelRegistry.delete(id); };
  }, [id]);

  useEffect(() => {
    const entry = labelRegistry.get(id);
    if (entry) entry.worldPos = worldPos;
  }, [id, worldPos]);

  const background = color ? hexToRgba(color, 0.55) : undefined;

  return (
    <div className="label-anchor">
      <div ref={bodyRef} className={className} style={background ? { backgroundColor: background } : undefined}>
        {children}
      </div>
    </div>
  );
}

function applyLabelTransform(entry, y, scale) {
  entry.appliedY = y;
  entry.appliedScale = scale;
  if (entry.bodyRef.current) {
    const parts = [];
    if (Math.abs(y) > 0.5) parts.push(`translate3d(0, ${y.toFixed(1)}px, 0)`);
    if (Math.abs(scale - 1) > 0.01) parts.push(`scale(${scale.toFixed(3)})`);
    entry.bodyRef.current.style.transform = parts.join(' ');
  }
}

function LabelDeclutter() {
  const frameCount = useRef(0);
  const scratchVec = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    frameCount.current += 1;
    if (frameCount.current % 3 !== 0) return; // ~20fps is plenty for label layout

    const entries = Array.from(labelRegistry.values())
      .filter((e) => e.bodyRef.current);

    entries.forEach((e) => {
      if (!e.worldPos) return;
      const dist = scratchVec.current.set(e.worldPos[0], e.worldPos[1], e.worldPos[2]).distanceTo(camera.position);
      const rawScale = LABEL_SCALE_REF_DISTANCE / Math.max(dist, 1e-3);
      e.targetScale = Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, rawScale));
    });

    const items = entries.map((e) => {
      const rect = e.bodyRef.current.getBoundingClientRect();
      return {
        e,
        top: rect.top - e.appliedY, // natural (un-offset) position
        left: rect.left,
        width: rect.width,
        height: rect.height,
        target: 0,
      };
    });

    const GAP = 4;
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          const aTop = a.top + a.target;
          const bTop = b.top + b.target;
          const overlapY = Math.min(aTop + a.height, bTop + b.height) - Math.max(aTop, bTop);
          const overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
          if (overlapY > 0 && overlapX > 0) {
            const push = (overlapY + GAP) / 2;
            const aCenter = aTop + a.height / 2;
            const bCenter = bTop + b.height / 2;
            // Sub-pixel rendering noise makes aCenter/bCenter flicker across
            // frames when two labels sit almost exactly on top of each other,
            // which would otherwise flip the push direction every frame and
            // make the pair jitter around zero instead of settling apart.
            // Fall back to stable array order whenever the centers are
            // ambiguously close.
            const aGoesUp = Math.abs(aCenter - bCenter) > 0.5 ? aCenter <= bCenter : i < j;
            if (aGoesUp) {
              a.target -= push;
              b.target += push;
            } else {
              a.target += push;
              b.target -= push;
            }
          }
        }
      }
    }

    items.forEach((item) => {
      const clamped = Math.max(-90, Math.min(90, item.target));
      const easedY = item.e.appliedY + (clamped - item.e.appliedY) * 0.25;
      const targetScale = item.e.targetScale ?? 1;
      const easedScale = item.e.appliedScale + (targetScale - item.e.appliedScale) * 0.25;
      applyLabelTransform(item.e, Math.abs(easedY) < 0.1 ? 0 : easedY, easedScale);
    });
  });

  return null;
}

function getLabelVisibilityKey(labelIdBase, lbl, index) {
  return `${labelIdBase}:${lbl.anchor ?? index}:${index}`;
}

function LabelLayer({ object3D, hiddenLabelKeys }) {
  const ud = object3D.userData || {};
  const labels = Array.isArray(ud.labels) ? ud.labels : [];
  // Prefer the Blockly block's own id over the Three.js object's uuid: every
  // workspace edit (even just dragging a block) regenerates the whole scene
  // from scratch with brand-new THREE.Object3D instances (new uuids), which
  // would otherwise reset every label's declutter/scale animation state on
  // each edit. srcBlockId stays stable across regenerations for the same
  // block, so the label keeps its identity (and its settled position).
  const labelIdBase = ud.srcBlockId ?? object3D.uuid;

  const needsDefault = labels.length === 0 && ud.geoType === 'geo_vector_line';
  const derived = needsDefault
    ? [
      { anchor: 'origin', text: `Pos ${fmtVec(ud.origin)}`, distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#49a1ff' },
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

function Scene({ objects = [], hiddenLabelKeys }) {
  const { settings } = useSettingsStore()

  useEffect(() => {
    objects.forEach((o) => {
      if (!o) return;
      o.traverse((child) => {
        if (child.isMesh) child.receiveShadow = settings.objectsReceiveShadows;
      });
    });
  }, [objects, settings.objectsReceiveShadows]);

  return (
    <>
      <LabelDeclutter />
      <ambientLight intensity={0.4} />

      {/* 1. The Headlight (Camera Light) */}
      <HeadLight />

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
        <gridHelper args={[40, 40, 0x444444, 0x222222]} position={[0, -0.005, 0]} />
      )}

      {settings.showBox && (
        <BoundingBoxRoom size={40} />
      )}

      {settings.showAxes && (
        <>
          <AxisLabels size={40} step={1} />
          <Axes length={20} position={[0, 0, 0]} />
        </>
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

const BACKGROUND_COLORS = {
  dark: '#1a1a1c',
  light: '#f7f4ee',
}

export default function Scene3D({ objects = [] }) {
  const { settings } = useSettingsStore()
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const [hiddenLabelKeys, setHiddenLabelKeys] = useState(() => new Set());

  const initialCamPos = useMemo(() => new THREE.Vector3(...DEFAULT_CAMERA_POSITION), []);
  const initialTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useLayoutEffect(() => {
    window.THREE = THREE
    window.threeObjStore = globalThreeObjStore

    return () => {
      delete window.THREE
      delete window.threeObjStore
    }
  }, []);

  const recenter = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.copy(initialCamPos);
    controlsRef.current.target.copy(initialTarget);
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
          <OrbitControls ref={controlsRef} />
          <CameraHandle onReady={(cam) => (cameraRef.current = cam)} />
          <SelectablePointPicker onTogglePointLabel={handleTogglePointLabel} />
          <Scene objects={objects} hiddenLabelKeys={hiddenLabelKeys} />
          <color attach="background" args={[BACKGROUND_COLORS[settings.sceneBackground] ?? BACKGROUND_COLORS.dark]} />
        </Canvas>
        <button
          className={`recenter-btn${settings.sceneBackground === 'light' ? ' recenter-btn--light' : ''}`}
          onClick={recenter}
          aria-label="Recenter camera"
          title="Recenter"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
