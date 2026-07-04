import React, { useMemo, useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react'
import { useThree, useFrame, Canvas } from '@react-three/fiber' // ADDED: useFrame
import { Edges, OrbitControls, Text, Billboard, Html } from '@react-three/drei'
import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
const THREE = { ...THREEBase, TeapotGeometry }

import './Scene3D.css'
import useSettingsStore from '@/store/useSettingsStore'

const DEFAULT_CAMERA_POSITION = [20, 35, 40]

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
      color="#dbe9ff"
      intensity={2.5}
      decay={0}
      distance={100}
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
    const helper = new THREE.ArrowHelper(direction, origin, length, new THREE.Color(color), 0.1, 0.1)
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

function LabelLayer({ object3D }) {
  const ud = object3D.userData || {};
  const labels = Array.isArray(ud.labels) ? ud.labels : [];

  const needsDefault = labels.length === 0 && ud.geoType === 'geo_vector_line';
  const derived = needsDefault
    ? [
      { anchor: 'origin', text: `Pos ${fmtVec(ud.origin)}`, distanceFactor: 8, offset: [0.12, 0.12, 0] },
      ...(ud.rPoint != null && Number.isFinite(ud.t)
        ? [{ anchor: 'rPoint', text: `r(t=${ud.t}) ${fmtVec(ud.rPoint)}`, distanceFactor: 8, offset: [0.12, 0.12, 0] }]
        : []),
    ]
    : labels;

  return (
    <>
      {derived.map((lbl, i) => {
        const pos = resolveAnchor(object3D, lbl.anchor);
        if (!pos) return null;

        const df = Number.isFinite(lbl.distanceFactor) ? lbl.distanceFactor : 8;
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

        return (
          <group key={`lbl-${i}`} position={[pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]]}>
            <Html distanceFactor={df}>
              <div className={`label${lbl.emphasis ? ' label--emphasis' : ''}${lbl.className ? ` ${lbl.className}` : ''}`}>
                {text}
              </div>
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

function SelectablePointPicker({ onSelectPoint, onClearPoint }) {
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

      if (!marker) {
        onClearPoint();
        return;
      }

      event.stopPropagation();
      onSelectPoint(marker.getWorldPosition(new THREE.Vector3()));
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    return () => canvas.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, gl, onClearPoint, onSelectPoint, pointer, raycaster, scene]);

  return null;
}

const globalThreeObjStore = {}

function Scene({ objects = [], selectedPoint }) {
  const { settings } = useSettingsStore()

  return (
    <>
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

      <gridHelper args={[40, 40, 0x444444, 0x222222]} position={[0, -0.005, 0]} />

      {/* 3. The Bounding Box */}
      <BoundingBoxRoom size={40} />

      <AxisLabels size={40} step={1} />
      <Axes length={20} position={[0, 0, 0]} />

      {objects.map((o, i) => {
        if (!o) return null;
        return (
          <group key={i}>
            {/* MAKE SURE: The objects you feed into this array have `castShadow` 
                and `receiveShadow` set on their meshes, or they won't cast shadows! */}
            <primitive object={o} />
            {settings.showLabels && <LabelLayer object3D={o} />}
          </group>
        );
      })}

      {selectedPoint && (
        <group position={[
          selectedPoint.position.x + 0.12,
          selectedPoint.position.y + 0.12,
          selectedPoint.position.z,
        ]}>
          <Html distanceFactor={8}>
            <div className="label coordinate-label">{selectedPoint.text}</div>
          </Html>
        </group>
      )}
    </>
  );
}

export default function Scene3D({ objects = [] }) {
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

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

  useEffect(() => {
    setSelectedPoint(null);
  }, [objects]);

  const recenter = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.copy(initialCamPos);
    controlsRef.current.target.copy(initialTarget);
    controlsRef.current.update();
  };

  const handleSelectPoint = useCallback((position) => {
    setSelectedPoint({
      position,
      text: fmtVec(position),
    });
  }, []);

  const handleClearPoint = useCallback(() => {
    setSelectedPoint(null);
  }, []);

  return (
    <div className="editor-body-3d">
      <div className="relative flex-1 min-h-0">
        <Canvas
          shadows
          camera={{ position: [20, 35, 40], fov: 45, near: 0.1, far: 5000 }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <OrbitControls ref={controlsRef} />
          <CameraHandle onReady={(cam) => (cameraRef.current = cam)} />
          <SelectablePointPicker onSelectPoint={handleSelectPoint} onClearPoint={handleClearPoint} />
          <Scene objects={objects} selectedPoint={selectedPoint} />
          <color attach="background" args={['#0e0e12']} />
        </Canvas>
        <button className="recenter-btn" onClick={recenter} aria-label="Recenter camera" title="Recenter">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 1 0 10a5 5 0 0 1 0-10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
