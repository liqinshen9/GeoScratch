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
const PLANE_POINT_A = new THREE.Vector3(1, 1, 2)
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0)
const CORRECT_DISTANCE = 3
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

function vectorMatches(a, b, tolerance = 1e-6) {
  return (
    a?.isVector3 &&
    b?.isVector3 &&
    closeNumber(a.x, b.x, tolerance) &&
    closeNumber(a.y, b.y, tolerance) &&
    closeNumber(a.z, b.z, tolerance)
  )
}

function pointLiesOnExercisePlane(point, tolerance = 1e-5) {
  if (!point?.isVector3) return false
  return Math.abs(point.clone().sub(PLANE_POINT_A).dot(PLANE_NORMAL)) <= tolerance
}

function isExercisePlaneObject(object) {
  const point = object?.userData?.point
  const normal = object?.userData?.normalRaw
  return (
    object.userData?.geoType === 'point_normal_plane_group' &&
    vectorMatches(point, PLANE_POINT_A) &&
    vectorMatches(normal, PLANE_NORMAL)
  )
}

function objectOrChildMatches(object, predicate) {
  if (!object?.isObject3D) return false
  let matched = false
  object.traverse((child) => {
    if (!matched && predicate(child)) matched = true
  })
  return matched
}

function workspaceHasPointPVector(workspace) {
  if (!workspace) return false
  return POINT_VECTOR_BLOCK_TYPES.some((type) => (
    workspace.getBlocksByType(type, false).some((block) => blockMatchesVec3(block, POINT_P))
  ))
}

function getInputBlock(block, inputName) {
  return block?.getInputTargetBlock?.(inputName) ?? null
}

function isExercisePlaneBlock(block) {
  return (
    block?.type === 'parametric_plane' &&
    blockMatchesVec3(getInputBlock(block, 'point'), PLANE_POINT_A) &&
    blockMatchesVec3(getInputBlock(block, 'norm'), PLANE_NORMAL)
  )
}

function isExercisePointQBlock(block) {
  return (
    block?.type === 'geo_show_point_on_object' &&
    isExercisePlaneBlock(getInputBlock(block, 'OBJECT'))
  )
}

function isPointPBlock(block) {
  return blockMatchesVec3(block, POINT_P)
}

function isNormalVectorBlock(block) {
  return blockMatchesVec3(block, PLANE_NORMAL)
}

function isPointDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isPointPBlock(getInputBlock(block, 'U')) &&
    isExercisePointQBlock(getInputBlock(block, 'V'))
  )
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

function hasExercisePlane(objects) {
  return objects.some((object) => objectOrChildMatches(object, isExercisePlaneObject))
}

function hasPointQOnExercisePlane(objects) {
  return objects.some((object) => (
    object?.userData?.geoType === 'annotated_object' &&
    pointLiesOnExercisePlane(object.userData.point) &&
    objectOrChildMatches(object, isExercisePlaneObject)
  ))
}

function hasPointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isPointDifferenceBlock)
}

function hasProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isNormalVectorBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasDotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isPointDifferenceBlock(left) && isNormalVectorBlock(right)) ||
      (isNormalVectorBlock(left) && isPointDifferenceBlock(right))
    )
  })
}

function hasValidDistanceComputation(workspace) {
  return hasProjectionDistanceBlock(workspace) || hasDotProductDistanceBlock(workspace)
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
  const hasDistanceComputation = hasValidDistanceComputation(workspace)
  const distanceIsCorrect = distanceAnswer !== null && closeNumber(distanceAnswer, CORRECT_DISTANCE, 0.01)
  const exercisePassed = distanceIsCorrect && hasDistanceComputation
  const exerciseIncorrect = distanceAnswer !== null && !exercisePassed
  const answerCardClass = `exercise-answer-card${exercisePassed ? ' is-correct' : ''}${exerciseIncorrect ? ' is-incorrect' : ''}`
  const hasPlaneStep = hasExercisePlane(objects)
  const hasPointPStep = workspaceHasPointPVector(workspace)
  const hasPointQStep = hasPointQOnExercisePlane(objects)
  const stepCompletion = {
    plane: hasPlaneStep,
    pointP: hasPointPStep,
    pointQ: hasPointQStep,
    difference: hasPointPStep && hasPointQStep && hasPointDifferenceBlock(workspace),
    distance: exercisePassed,
  }

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
                  {exercisePassed && <span className="exercise-pass-badge">Passed</span>}
                </div>
                <h1>1. <strong>Calculate distance from point P to a plane</strong></h1>
              </div>

              <div className="exercise-given-values" aria-label="Given values">
                <section>
                  <h3>Plane</h3>
                  <p>Point A = (1, 1, 2)</p>
                  <p>Normal n = (0, 1, 0)</p>
                </section>
                <section>
                  <h3>Point</h3>
                  <p>P = (3, 4, 5)</p>
                </section>
              </div>

              <ol className={`exercise-task-steps${exercisePassed ? ' is-passed' : ''}`}>
                <li className={stepCompletion.plane ? 'is-complete' : ''}>
                  Create the plane
                </li>
                <li className={stepCompletion.pointP ? 'is-complete' : ''}>
                  Create Point P
                </li>
                <li className={stepCompletion.pointQ ? 'is-complete' : ''}>
                  Choose any point Q on the plane.
                </li>
                <li className={stepCompletion.difference ? 'is-complete' : ''}>
                  Find the vector from Q to P, which is the same as finding P - Q.
                </li>
                <li className={stepCompletion.distance ? 'is-complete' : ''}>
                  Project P - Q onto n and take Vector Magnitude. Alternatively, you can use the dot product of (P - Q) and n because n is a unit vector. This gives the distance from P to the plane.
                </li>
              </ol>

              <div className={answerCardClass}>
                <span>Your answer:</span>
                <strong>{distanceAnswer !== null ? Number(distanceAnswer.toFixed(3)) : ''}</strong>
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
