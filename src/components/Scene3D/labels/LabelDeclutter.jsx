import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import THREE from '@/utils/three'
import { hexToRgba } from './labelAnchors'
import { stepLabelSim } from './labelSim'

// Module-level registry, not React context: drei's <Html> mounts into a
// separate ReactDOM root. See docs/architecture/label-declutter.md.
const labelRegistry = new Map()
let labelRegistryRevision = 0

// Gentle camera-distance scaling, tightly clamped.
const LABEL_SCALE_REF_DISTANCE = 56
const LABEL_SCALE_MIN = 0.6
const LABEL_SCALE_MAX = 1.0

const EMPHASIS_MASS = 2.5
// Bounds one settling burst so an impossible layout can't render forever.
const MAX_LABEL_SETTLE_FRAMES = 180

function LabelAnchor({
  id,
  visibilityKey,
  className,
  color,
  worldPos,
  emphasis,
  onHide,
  children,
}) {
  const bodyRef = useRef(null)

  // Keyed on `id` alone -- worldPos/emphasis are initial values only, written
  // live by the effect below. See docs/architecture/label-declutter.md#registry-key.
  useEffect(() => {
    const entry = {
      bodyRef,
      worldPos,
      cx: 0,
      cy: 0,
      hw: 0,
      hh: 0,
      offsetX: 0,
      offsetY: 0,
      velX: 0,
      velY: 0,
      appliedScale: 1,
      mass: emphasis ? EMPHASIS_MASS : 1,
    }
    labelRegistry.set(id, entry)
    labelRegistryRevision += 1
    applyLabelTransform(entry, 0, 0, 1)
    return () => {
      // Retract only our own entry. The scene rebuilds on every workspace edit,
      // and React can mount the replacement LabelAnchor for an id before
      // unmounting the old one; an unconditional delete then drops the live
      // entry, leaving a rendered label with nothing in the registry. Nothing
      // ever positions or scales it again, so it sits frozen at the mount
      // default -- full size and unoffset -- while its neighbours shrink with
      // camera distance.
      if (labelRegistry.get(id) === entry) labelRegistry.delete(id)
      labelRegistryRevision += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const entry = labelRegistry.get(id)
    if (!entry) return
    // Compare by value: `worldPos` is a fresh array on every render, so identity
    // alone would wake the sim and discard settled velocity on re-renders that
    // moved nothing.
    const previous = entry.worldPos
    const mass = emphasis ? EMPHASIS_MASS : 1
    const anchorMoved =
      !previous ||
      previous[0] !== worldPos[0] ||
      previous[1] !== worldPos[1] ||
      previous[2] !== worldPos[2]
    const massChanged = entry.mass !== mass
    entry.worldPos = worldPos
    entry.mass = mass
    if (!anchorMoved && !massChanged) return
    labelRegistryRevision += 1
    if (anchorMoved) {
      // Anchor jumped (scene rebuild): kill velocity, keep offset as a warm start.
      entry.velX = 0
      entry.velY = 0
    }
  }, [id, worldPos, emphasis])

  const background = color ? hexToRgba(color, 0.55) : undefined

  return (
    <div className="label-anchor">
      <div
        ref={bodyRef}
        className={className}
        style={background ? { backgroundColor: background } : undefined}
        onClick={() => onHide?.(visibilityKey)}
      >
        {children}
      </div>
    </div>
  )
}

function applyLabelTransform(entry, x, y, scale) {
  entry.offsetX = x
  entry.offsetY = y
  entry.appliedScale = scale
  if (entry.bodyRef.current) {
    const parts = []
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)
      parts.push(`translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`)
    if (Math.abs(scale - 1) > 0.01) parts.push(`scale(${scale.toFixed(3)})`)
    // translate3d MUST come before scale (CSS applies right-to-left).
    // See docs/architecture/label-declutter.md#transform-order.
    entry.bodyRef.current.style.transform = parts.join(' ')
  }
}

function LabelDeclutter() {
  const scratchVec = useRef(new THREE.Vector3())
  const settleFrameRef = useRef(0)
  const seenRegistryRevisionRef = useRef(-1)
  const cameraStateRef = useRef({
    px: NaN,
    py: NaN,
    pz: NaN,
    qx: NaN,
    qy: NaN,
    qz: NaN,
    qw: NaN,
    zoom: NaN,
  })

  useFrame(({ camera, invalidate }, delta) => {
    const entries = Array.from(labelRegistry.values()).filter((e) => e.bodyRef.current)

    const previousCamera = cameraStateRef.current
    const cameraChanged =
      previousCamera.px !== camera.position.x ||
      previousCamera.py !== camera.position.y ||
      previousCamera.pz !== camera.position.z ||
      previousCamera.qx !== camera.quaternion.x ||
      previousCamera.qy !== camera.quaternion.y ||
      previousCamera.qz !== camera.quaternion.z ||
      previousCamera.qw !== camera.quaternion.w ||
      previousCamera.zoom !== camera.zoom
    const registryChanged = seenRegistryRevisionRef.current !== labelRegistryRevision

    if (cameraChanged || registryChanged) settleFrameRef.current = 0
    previousCamera.px = camera.position.x
    previousCamera.py = camera.position.y
    previousCamera.pz = camera.position.z
    previousCamera.qx = camera.quaternion.x
    previousCamera.qy = camera.quaternion.y
    previousCamera.qz = camera.quaternion.z
    previousCamera.qw = camera.quaternion.w
    previousCamera.zoom = camera.zoom
    seenRegistryRevisionRef.current = labelRegistryRevision

    // Pass 1: camera-distance scale (unchanged logic, independent of position)
    let labelsStillMoving = false
    entries.forEach((e) => {
      if (!e.worldPos) return
      const dist = scratchVec.current
        .set(e.worldPos[0], e.worldPos[1], e.worldPos[2])
        .distanceTo(camera.position)
      const rawScale = LABEL_SCALE_REF_DISTANCE / Math.max(dist, 1e-3)
      const targetScale = Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, rawScale))
      const scaleDelta = targetScale - e.appliedScale
      if (Math.abs(scaleDelta) < 0.001) {
        e.appliedScale = targetScale
      } else {
        e.appliedScale += scaleDelta * 0.25
        labelsStillMoving = true
      }
    })

    // Pass 2: batch all DOM reads before any writes.
    // See docs/architecture/label-declutter.md#dom-batching.
    entries.forEach((e) => {
      const rect = e.bodyRef.current.getBoundingClientRect()
      e.cx = rect.left + rect.width / 2 - e.offsetX // natural (un-offset) center
      e.cy = rect.top + rect.height / 2 - e.offsetY
      e.hw = rect.width / 2
      e.hh = rect.height / 2
    })

    if (stepLabelSim(entries, delta)) labelsStillMoving = true

    entries.forEach((e) => applyLabelTransform(e, e.offsetX, e.offsetY, e.appliedScale))

    // frameloop="demand": keep ticking only while labels are settling.
    if (labelsStillMoving && settleFrameRef.current < MAX_LABEL_SETTLE_FRAMES) {
      settleFrameRef.current += 1
      invalidate()
    } else if (!labelsStillMoving) {
      settleFrameRef.current = 0
    }
  })

  return null
}

export { LabelAnchor, LabelDeclutter }
export default LabelDeclutter
