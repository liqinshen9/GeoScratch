import { useCallback, useRef, useState } from 'react'
import * as THREE from 'three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'

import '@/components/EditorShell/editor-shell.css'
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
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
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

  return (
    <div className="exercise-page exercise-page--editor">
      <main className={`editor-shell editor-shell--with-leading exercise-editor-shell${workspaceMaximized ? ' editor-shell--maximized' : ''}`}>
        <EditorColumnHeaders
          leadingHeader={<h2>Exercise</h2>}
          workspace={workspace}
          workspaceMaximized={workspaceMaximized}
          onWorkspaceMaximizedChange={setWorkspaceMaximized}
          onClearWorkspace={() => clearWorkspaceRef.current()}
        />

        <div className="editor-body-row">
          {!workspaceMaximized && (
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
          )}

          <BlocksCanvas
            id="exercise"
            workspaceMaximized={workspaceMaximized}
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
