import { useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import THREE from '@/utils/three'

import './Scene3D.css'
import useSettingsStore from '@/store/useSettingsStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import HaloDepthPrepass from './HaloDepthPrepass'
import HaloDilatePass from './HaloDilatePass'
import HaloUniformSync from './HaloUniformSync'
import SelectionHighlight from './SelectionHighlight'
import AnimationDriver from './AnimationDriver'
import { AXIS_COLORS } from './sceneConstants'
import { CameraHandle, HeadLight } from './HeadLight'
import { BoundingBoxRoom, Axes, FadedGrid } from './SceneFurniture'
import ScenePicker from './ScenePicker'
import LabelDeclutter from './labels/LabelDeclutter'
import LabelLayer from './labels/LabelLayer'
import { ZoomInvariantScaler, DashZoomSync, FatLineSync } from './sizing/GlyphSizing'
import { computeNestingRenderOrders } from '@/utils/nestingRenderOrder'
import { getObjectFocus } from '@/utils/sceneFocus'

const DEFAULT_CAMERA_POSITION = [0, 25, 50]
const DEFAULT_CAMERA_OFFSET = new THREE.Vector3(...DEFAULT_CAMERA_POSITION)
// Orbit zoom limits -- MIN keeps the camera from clipping through/inside
// objects when zooming in; MAX keeps the scene from shrinking into an
// unreadable speck (or disappearing entirely) when zooming out.
const MIN_CAMERA_DISTANCE = 2
const MAX_CAMERA_DISTANCE = 300
const globalThreeObjStore = {}

function Scene({ objects = [], hiddenLabelKeys, controlsRef, onHideLabel }) {
  const { settings } = useSettingsStore()

  useEffect(() => {
    objects.forEach((o) => {
      if (!o) return
      o.traverse((child) => {
        if (child.isMesh) child.receiveShadow = settings.objectsReceiveShadows
      })
    })
  }, [objects, settings.objectsReceiveShadows])

  useEffect(() => {
    const renderOrders = computeNestingRenderOrders(objects)
    objects.forEach((o, i) => {
      if (!o) return
      const order = renderOrders[i]
      o.traverse((child) => {
        if (child.isMesh || child.isLine || child.isLineSegments) {
          child.renderOrder = order
        }
      })
    })
  }, [objects])

  return (
    <>
      <ZoomInvariantScaler
        objects={objects}
        zoomEnabled={settings.zoomInvariantSizing}
        extraThick={settings.extraThickLines}
        extraThickVectors={settings.extraThickVectors}
        extraLargePoints={settings.extraLargePoints}
      />
      <FatLineSync
        objects={objects}
        extraThick={settings.extraThickLines}
        extraThickVectors={settings.extraThickVectors}
      />
      <DashZoomSync objects={objects} zoomEnabled={settings.zoomInvariantSizing} />
      <SelectionHighlight objects={objects} />
      <AnimationDriver objects={objects} />
      <LabelDeclutter />
      <ambientLight intensity={0.4} />

      {/* 1. The Headlight (Camera Light) */}
      <HeadLight controlsRef={controlsRef} castShadow={settings.cameraShadowsEnabled} />

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

      {settings.showGrid && <FadedGrid />}

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
        if (!o) return null
        return (
          <group key={i}>
            {/* MAKE SURE: The objects you feed into this array have `castShadow`
                set on their meshes, or they won't cast shadows! `receiveShadow` is
                managed above based on settings.objectsReceiveShadows. */}
            <primitive object={o} />
            {settings.showLabels && (
              <LabelLayer
                object3D={o}
                hiddenLabelKeys={hiddenLabelKeys}
                onHideLabel={onHideLabel}
                labelDetail={settings.labelDetail}
              />
            )}
          </group>
        )
      })}
    </>
  )
}

// Placeholder until real dark mode support lands.
const SCENE_BACKGROUND_COLOR = '#ffffff'

export default function Scene3D({ objects = [] }) {
  const { settings, updateSetting } = useSettingsStore()
  const setSelectedBlockId = useWorkspaceStore((s) => s.setSelectedBlockId)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const focusRef = useRef({ center: new THREE.Vector3(0, 0, 0), radius: 20 })
  const didInitialFocusRef = useRef(false)
  const prevObjectCountRef = useRef(0)
  const [hiddenLabelKeys, setHiddenLabelKeys] = useState(() => new Set())
  const [haloRawTarget, setHaloRawTarget] = useState(null)
  const [haloDilatedTarget, setHaloDilatedTarget] = useState(null)
  // cameraRef/controlsRef populate async (R3F's own render loop), after the
  // first `objects` update can already have fired; bump this once they're
  // ready so the auto-frame effect below retries immediately instead of
  // waiting on the next unrelated block edit.
  const [refsReadyTick, setRefsReadyTick] = useState(0)

  const handleControlsReady = useCallback((instance) => {
    if (controlsRef.current === instance) return
    controlsRef.current = instance
    if (instance) setRefsReadyTick((tick) => tick + 1)
  }, [])

  const handleCameraReady = useCallback((camera) => {
    if (cameraRef.current === camera) return
    cameraRef.current = camera
    if (camera) setRefsReadyTick((tick) => tick + 1)
  }, [])

  useLayoutEffect(() => {
    window.THREE = THREE
    window.threeObjStore = globalThreeObjStore

    return () => {
      delete window.THREE
      delete window.threeObjStore
    }
  }, [])

  // Auto-frame on first load and on new-object-added only (not on move/edit
  // of existing objects), gated behind settings.autoFocusOnNewObject.
  useEffect(() => {
    if (!settings.autoFocusOnNewObject) return

    const focus = getObjectFocus(objects)
    if (!focus) return

    focusRef.current = focus

    const isNewObjectAdded = objects.length > prevObjectCountRef.current
    const isFirstFocus = !didInitialFocusRef.current
    prevObjectCountRef.current = objects.length

    if (!cameraRef.current || !controlsRef.current) return
    if (!isFirstFocus && !isNewObjectAdded) return
    didInitialFocusRef.current = true

    const camera = cameraRef.current
    const controls = controlsRef.current
    const oldTarget = controls.target.clone()
    const oldOffset = camera.position.clone().sub(oldTarget)
    const offset = oldOffset.lengthSq() > 1e-8 ? oldOffset : DEFAULT_CAMERA_OFFSET.clone()
    const minDistance = Math.max(focusRef.current.radius * 2.6, 8)

    if (offset.length() < minDistance) offset.setLength(minDistance)
    controls.target.copy(focusRef.current.center)
    camera.position.copy(focusRef.current.center).add(offset)
    controls.update()
  }, [objects, refsReadyTick, settings.autoFocusOnNewObject])

  const resetDefaultView = () => {
    if (!cameraRef.current || !controlsRef.current) return
    cameraRef.current.position.set(...DEFAULT_CAMERA_POSITION)
    cameraRef.current.up.set(0, 1, 0)
    cameraRef.current.zoom = 1
    cameraRef.current.updateProjectionMatrix()
    controlsRef.current.target.set(0, 0, 0)
    controlsRef.current.update()
  }

  const handleHideLabel = useCallback((labelKey) => {
    setHiddenLabelKeys((current) => {
      const next = new Set(current)
      next.add(labelKey)
      return next
    })
  }, [])

  // Right-click on an object: hide all its labels if any are showing, else
  // reveal all of them.
  const handleToggleObjectLabels = useCallback((labelKeys) => {
    setHiddenLabelKeys((current) => {
      const allHidden = labelKeys.every((labelKey) => current.has(labelKey))
      const next = new Set(current)
      labelKeys.forEach((labelKey) => (allHidden ? next.delete(labelKey) : next.add(labelKey)))
      return next
    })
  }, [])

  const handleSelectBlockFrom3D = useCallback(
    (blockId) => setSelectedBlockId(blockId),
    [setSelectedBlockId],
  )

  return (
    <div className="editor-body-3d">
      <div className="relative flex-1 min-h-0">
        <Canvas
          shadows
          frameloop="demand"
          camera={{ position: DEFAULT_CAMERA_POSITION, fov: 45, near: 0.1, far: 5000 }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%' }}
        >
          <OrbitControls
            makeDefault
            minDistance={MIN_CAMERA_DISTANCE}
            maxDistance={MAX_CAMERA_DISTANCE}
            ref={handleControlsReady}
          />
          <CameraHandle onReady={handleCameraReady} />
          <ScenePicker
            onSelectBlock={handleSelectBlockFrom3D}
            onToggleLabels={handleToggleObjectLabels}
          />
          <Scene
            objects={objects}
            hiddenLabelKeys={hiddenLabelKeys}
            controlsRef={controlsRef}
            onHideLabel={handleHideLabel}
          />
          <HaloDepthPrepass onTargetReady={setHaloRawTarget} />
          <HaloDilatePass rawTarget={haloRawTarget} onTargetReady={setHaloDilatedTarget} />
          <HaloUniformSync objects={objects} target={haloDilatedTarget} />
          <color attach="background" args={[SCENE_BACKGROUND_COLOR]} />
          {/* Screen-space orientation gizmo -- an alternative to the in-scene
              axes that doesn't take up world space; the in-scene axes can be
              hidden via the toggle below and this still shows X/Y/Z. */}
          {settings.showAxisGizmo && (
            <GizmoHelper alignment="top-right" margin={[40, 40]}>
              <GizmoViewport
                axisColors={[AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z]}
                labelColor="black"
                scale={28}
                axisHeadScale={0.85}
              />
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
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M12 21V5M12 5l-4 4M12 5l4 4M21 12H5M5 12l4-4M5 12l4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            className="scene-view-btn"
            onClick={resetDefaultView}
            aria-label="Reset to default 3D view"
            title="Default view"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
              <path
                d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
