import { useEffect, useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import useWorkspaceStore from '@/store/useWorkspaceStore'
import useSettingsStore from '@/store/useSettingsStore'
import useSceneHighlightStore from '@/store/useSceneHighlightStore'
import { collectSelectionTargets } from '@/utils/scenePicking'
import { applyHighlight } from './highlightEffects'

// World-axis arrow groups tagged `userData.sceneAxis` by SceneFurniture.
function collectSceneAxes(scene, axis) {
  if (!axis) return []
  const found = []
  scene.traverse((child) => {
    if (child.userData?.sceneAxis === axis) found.push(child)
  })
  return found
}

// Applies the user's highlight style to `targets` for as long as they're set.
function useHighlight(targets) {
  const { scene, invalidate, size } = useThree()
  const enabled = useSettingsStore((s) => s.settings.objectHighlightEnabled)
  const style = useSettingsStore((s) => s.settings.objectHighlightStyle)
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
}

// Headless, mounted under <Scene>. See docs/architecture/selection-and-picking.md.
export default function SelectionHighlight({ objects = [] }) {
  const { scene } = useThree()
  const selectedBlockId = useWorkspaceStore((s) => s.selectedBlockId)
  const highlightedAxis = useSceneHighlightStore((s) => s.highlightedAxis)

  // Matched by srcBlockId (stable across rebuilds, unlike uuid), nested
  // objects included. See docs/architecture/selection-and-picking.md.
  const selectionTargets = useMemo(
    () => collectSelectionTargets(objects, selectedBlockId),
    [objects, selectedBlockId],
  )
  const axisTargets = useMemo(
    () => collectSceneAxes(scene, highlightedAxis),
    [scene, highlightedAxis],
  )

  useHighlight(selectionTargets)
  useHighlight(axisTargets)

  return null
}
