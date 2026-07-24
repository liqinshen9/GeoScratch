import { useCallback, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { FullScreenOne, OffScreenOne } from '@icon-park/react'
import * as THREE from 'three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import CategoryToolbox from '@/components/BlocksCanvas/toolbox/CategoryToolbox'
import BlockPalette from '@/components/BlocksCanvas/palette/BlockPalette'
import Scene3D from '@/components/Scene3D/Scene3D'
import { Button } from '@/components/ui/button'
import addBlockToWorkspace from '@/utils/addBlockToWorkspace'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'

import './ExercisePage.css'

const POINT_P = new THREE.Vector3(3, 4, 5)
const CORRECT_DISTANCE = 4
const POINT_VECTOR_BLOCK_TYPES = ['linalg_vec3', 'linalg_point']

function closeNumber(a, b, tolerance = 1e-6) {
  return Math.abs(Number(a) - b) <= tolerance
}

function blockMatchesVec3(block, target) {
  return (
    POINT_VECTOR_BLOCK_TYPES.includes(block?.type) &&
    closeNumber(block.getFieldValue('X'), target.x) &&
    closeNumber(block.getFieldValue('Y'), target.y) &&
    closeNumber(block.getFieldValue('Z'), target.z)
  )
}

function workspaceHasPointPVector(workspace) {
  if (!workspace) return false
  return POINT_VECTOR_BLOCK_TYPES.some((type) => (
    workspace.getBlocksByType(type, false).some((block) => blockMatchesVec3(block, POINT_P))
  ))
}

function objectIsAtPointP(object) {
  const position = object?.userData?.point ?? object?.position
  return (
    position?.isVector3 &&
    closeNumber(position.x, POINT_P.x) &&
    closeNumber(position.y, POINT_P.y) &&
    closeNumber(position.z, POINT_P.z)
  )
}

function createPointPMarker() {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.05 }),
  )

  marker.position.copy(POINT_P)
  marker.userData.geoType = 'exercise_point_p'
  marker.userData.labelAnchors = {
    p: { type: 'world', position: [POINT_P.x, POINT_P.y, POINT_P.z] },
  }
  marker.userData.labels = [
    { anchor: 'p', text: 'P = [3, 4, 5]', distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#2563eb' },
  ]

  return marker
}

function addExercisePointPIfNeeded(objects, workspace) {
  if (!workspaceHasPointPVector(workspace)) return objects
  if (objects.some(objectIsAtPointP)) return objects
  return [...objects, createPointPMarker()]
}

function getDistanceAnswer(objects) {
  const distanceObject = objects.find((object) => (
    object?.userData?.geoType === 'point_plane_distance_dot' ||
    object?.userData?.geoType === 'point_plane_distance_projection_magnitude'
  ))
  const distance = Number(distanceObject?.userData?.distance)
  return Number.isFinite(distance) ? distance : null
}

export default function ExercisePage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [categoryId, setCategoryId] = useState('create')
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toolboxPosition, setToolboxPosition] = useState(null)
  const clearWorkspaceRef = useRef(() => {})
  const distanceAnswer = getDistanceAnswer(objects)
  const exercisePassed = distanceAnswer !== null && closeNumber(distanceAnswer, CORRECT_DISTANCE, 0.01)

  const handleObjectsChange = useCallback(
    (objs) => {
      const exerciseObjects = addExercisePointPIfNeeded(objs, workspace)
      setPendingObjects(exerciseObjects)
      if (autoRender) setObjects(exerciseObjects)
    },
    [autoRender, setPendingObjects, setObjects, workspace],
  )

  function selectCategory(nextCategoryId) {
    setCategoryId(nextCategoryId)
    setPaletteOpen((isOpen) => (nextCategoryId === categoryId ? !isOpen : true))
  }

  const handleBlockSelect = useCallback(
    (type) => {
      if (!workspace) return
      addBlockToWorkspace(workspace, type)
    },
    [workspace],
  )

  function startToolboxDrag(event) {
    if (event.button !== 0) return
    if (event.target.closest('.palette-block-preview')) return

    const panel = event.currentTarget
    const panelRect = panel.getBoundingClientRect()
    const origin = toolboxPosition ?? {
      x: panelRect.left,
      y: panelRect.top,
    }

    event.preventDefault()
    setToolboxPosition(origin)

    function moveToolbox(moveEvent) {
      const currentPanelRect = panel.getBoundingClientRect()
      const maxX = Math.max(8, window.innerWidth - currentPanelRect.width - 8)
      const maxY = Math.max(8, window.innerHeight - currentPanelRect.height - 8)
      const nextX = Math.min(Math.max(8, origin.x + moveEvent.clientX - event.clientX), maxX)
      const nextY = Math.min(Math.max(8, origin.y + moveEvent.clientY - event.clientY), maxY)
      setToolboxPosition({ x: nextX, y: nextY })
    }

    function stopToolbox() {
      window.removeEventListener('mousemove', moveToolbox)
      window.removeEventListener('mouseup', stopToolbox)
    }

    window.addEventListener('mousemove', moveToolbox)
    window.addEventListener('mouseup', stopToolbox)
  }

  return (
    <div className={`exercise-page exercise-page--editor${workspaceMaximized ? ' exercise-page--workspace-maximized' : ''}`}>
      <main className="exercise-editor-shell">
        <div className="exercise-editor-header-row">
          {!workspaceMaximized && (
            <header className="panel-column-header exercise-head">
              <h2>Exercise</h2>
            </header>
          )}

          {!workspaceMaximized && (
            <header className="panel-column-header exercise-head">
              <h2>Toolbox</h2>
            </header>
          )}

          <header className="panel-column-header exercise-head exercise-workspace-head">
            <div>
              <h2>Workspace</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="exercise-workspace-toggle"
                onClick={() => setWorkspaceMaximized((maximized) => !maximized)}
                disabled={!workspace}
                title={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
                aria-label={workspaceMaximized ? 'Restore panels' : 'Maximize workspace'}
                aria-pressed={workspaceMaximized}
              >
                {workspaceMaximized ? (
                  <OffScreenOne theme="outline" size="20" fill="#333" />
                ) : (
                  <FullScreenOne theme="outline" size="20" fill="#333" />
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => clearWorkspaceRef.current()}
                disabled={!workspace}
              >
                <Trash2 aria-hidden="true" size={16} />
                Clear
              </Button>
            </div>
          </header>

          <header className="panel-column-header exercise-head exercise-head--last">
            <h2>3D View</h2>
          </header>
        </div>

        <div className="exercise-editor-body-row">
          <aside className={`exercise-task-panel${exercisePassed ? ' is-passed' : ''}`}>
            <div className="exercise-task-panel__top">
              <div className="exercise-task-panel__meta-row">
                <span className="exercise-task-number">Exercise 1</span>
                {exercisePassed && <span className="exercise-pass-badge">Passed</span>}
              </div>
              <h1>Calculate distance from point P to a plane</h1>
            </div>

            <div className="exercise-given-values" aria-label="Given values">
              <section>
                <h3>Plane</h3>
                <p>Point A = (1, 0, 2)</p>
                <p>Normal n = (0, 1, 0)</p>
              </section>
              <section>
                <h3>Point</h3>
                <p>P = (3, 4, 5)</p>
              </section>
            </div>

            <ol className={`exercise-task-steps${exercisePassed ? ' is-passed' : ''}`}>
              <li className={exercisePassed ? 'is-complete' : ''}>
                Create the plane
              </li>
              <li className={exercisePassed ? 'is-complete' : ''}>
                Create Point P
              </li>
              <li className={exercisePassed ? 'is-complete' : ''}>
                Choose any point Q on the plane.
              </li>
              <li className={exercisePassed ? 'is-complete' : ''}>
                Find the vector from Q to P, which is the same as finding P - Q.
              </li>
              <li className={exercisePassed ? 'is-complete' : ''}>
                Project P - Q onto n and take Vector Magnitude. Alternatively, you can use the dot product of (P - Q) and n because n is a unit vector. This gives the distance from P to the plane.
              </li>
            </ol>


            <div className={`exercise-answer-card${exercisePassed ? ' is-correct' : ''}`}>
              <span>Correct answer should be:</span>
              <strong>{CORRECT_DISTANCE}</strong>
              {distanceAnswer !== null && (
                <p>Your answer: {Number(distanceAnswer.toFixed(3))}</p>
              )}
            </div>
          </aside>

          {paletteOpen && !workspaceMaximized && (
            <div
              className={`exercise-blocks-panel${toolboxPosition ? ' is-dragging' : ''}`}
              style={toolboxPosition ? { left: toolboxPosition.x, top: toolboxPosition.y } : undefined}
              onMouseDown={startToolboxDrag}
            >
              <BlockPalette categoryId={categoryId} onBlockSelect={handleBlockSelect} />
            </div>
          )}

          <aside className="exercise-category-panel">
            <CategoryToolbox selected={categoryId} onSelect={selectCategory} />
          </aside>

          <BlocksCanvas
            categoryId={categoryId}
            workspaceMaximized={workspaceMaximized}
            hideInlineControls
            onCategoryChange={setCategoryId}
            onObjectsChange={handleObjectsChange}
            onRegisterClear={(fn) => {
              clearWorkspaceRef.current = fn
            }}
          />
          <Scene3D objects={objects} />
        </div>
      </main>
    </div>
  )
}
