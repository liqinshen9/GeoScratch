import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import THREE from '@/utils/three'
import {
  classifyGesture,
  findLabelOwner,
  findSelectableLine,
  findSelectablePointMarker,
  resolveSelectedBlockId,
  CLICK_MAX_DIST,
} from '@/utils/scenePicking'
import { getLabelsForObject, getLabelVisibilityKeysForObject } from './labels/labelData'

// Owns raw pointer routing on the canvas. NEVER stopPropagation/preventDefault
// on pointerdown (OrbitControls shares the element). Click vs drag is decided
// on pointerup (#92). Left click -> select; right click -> toggle labels (#75).
// See docs/architecture/selection-and-picking.md#scenepicker.
function ScenePicker({ onSelectBlock, onToggleLabels }) {
  const { camera, gl, scene } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const downRef = useRef(null)

  useEffect(() => {
    const canvas = gl.domElement

    const raycastAt = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      raycaster.params.Line.threshold = 0.18
      return raycaster.intersectObjects(scene.children, true).filter((hit) => hit.object.visible)
    }

    // Kept alive until the next pointerdown so contextmenu can consult it
    // (its ordering vs pointerup is platform-dependent).
    const handlePointerDown = (event) => {
      // Ignore secondary touch points (pinch-zoom).
      if (event.pointerType === 'touch' && event.isPrimary === false) return
      downRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        time: performance.now(),
        pointerId: event.pointerId,
        button: event.button,
        moved: false,
      }
    }

    const handlePointerMove = (event) => {
      const down = downRef.current
      if (!down || down.moved || event.pointerId !== down.pointerId) return
      if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > CLICK_MAX_DIST) {
        down.moved = true
      }
    }

    // On window, not the canvas -- OrbitControls captures the pointer mid-drag.
    const handlePointerUp = (event) => {
      const down = downRef.current
      if (!down || down.button !== 0 || event.pointerId !== down.pointerId) return
      const up = {
        clientX: event.clientX,
        clientY: event.clientY,
        time: performance.now(),
        pointerId: event.pointerId,
      }
      if (down.moved || classifyGesture(down, up) !== 'click') return
      onSelectBlock(resolveSelectedBlockId(raycastAt(event)))
    }

    const handlePointerCancel = () => {
      downRef.current = null
    }

    const handleContextMenu = (event) => {
      // A right-drag (OrbitControls pan) also ends with a contextmenu event --
      // leave the native menu alone then, only act on an in-place right-click.
      if (downRef.current?.moved) return

      const hits = raycastAt(event)
      const marker = hits.map((hit) => findSelectablePointMarker(hit.object)).find(Boolean)
      const line = marker ? null : hits.map((hit) => findSelectableLine(hit.object)).find(Boolean)
      const owner = marker
        ? findLabelOwner(marker, getLabelsForObject)
        : line
          ? line
          : hits.map((hit) => findLabelOwner(hit.object, getLabelsForObject)).find(Boolean)

      if (!owner) return
      event.preventDefault()
      onToggleLabels(getLabelVisibilityKeysForObject(owner))
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [camera, gl, scene, pointer, raycaster, onSelectBlock, onToggleLabels])

  return null
}

export default ScenePicker
