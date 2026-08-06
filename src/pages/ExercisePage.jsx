import { useCallback, useRef, useState } from 'react'
import * as THREE from 'three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'

import '@/components/EditorShell/editor-shell.css'
import './ExercisePage.css'

const POINT_VECTOR_BLOCK_TYPES = ['linalg_vec3', 'linalg_point']

const EXERCISE_1 = {
  id: 'point-plane',
  number: 1,
  title: 'Calculate distance from point P to a plane',
  planePoint: new THREE.Vector3(1, 1, 2),
  planeNormal: new THREE.Vector3(0, 1, 0),
  pointP: new THREE.Vector3(3, 4, 5),
  correctDistance: 3,
}

// Skew lines: L1 through P1 with direction d1, L2 through P2 with direction d2.
// n = d1 × d2 = (0, 0, 1). Plane through P1 with normal n contains L1.
// Distance from P2 to that plane is 3.
const EXERCISE_2 = {
  id: 'skew-lines',
  number: 2,
  title: 'Calculate the distance between two skewed lines',
  p1: new THREE.Vector3(1, 2, 1),
  d1: new THREE.Vector3(1, 0, 0),
  p2: new THREE.Vector3(1, 2, 4),
  d2: new THREE.Vector3(0, 1, 0),
  normal: new THREE.Vector3(0, 0, 1),
  correctDistance: 3,
}

const EXERCISES = [EXERCISE_1, EXERCISE_2]

function closeNumber(a, b, tolerance = 1e-6) {
  return Math.abs(Number(a) - b) <= tolerance
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

function vectorsParallel(a, b, tolerance = 1e-5) {
  if (!a?.isVector3 || !b?.isVector3) return false
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return false
  const cross = a.clone().cross(b)
  return cross.lengthSq() <= tolerance * tolerance * a.lengthSq() * b.lengthSq()
}

function blockMatchesVec3(block, target) {
  return (
    POINT_VECTOR_BLOCK_TYPES.includes(block?.type) &&
    closeNumber(block.getFieldValue('X'), target.x) &&
    closeNumber(block.getFieldValue('Y'), target.y) &&
    closeNumber(block.getFieldValue('Z'), target.z)
  )
}

function getInputBlock(block, inputName) {
  return block?.getInputTargetBlock?.(inputName) ?? null
}

function objectOrChildMatches(object, predicate) {
  if (!object?.isObject3D) return false
  let matched = false
  object.traverse((child) => {
    if (!matched && predicate(child)) matched = true
  })
  return matched
}

function formatVec(vec) {
  return `(${vec.x}, ${vec.y}, ${vec.z})`
}

// ─── Exercise 1 helpers ───────────────────────────────────────────────────────

function pointLiesOnExercise1Plane(point, tolerance = 1e-5) {
  if (!point?.isVector3) return false
  return Math.abs(point.clone().sub(EXERCISE_1.planePoint).dot(EXERCISE_1.planeNormal)) <= tolerance
}

function isExercise1PlaneObject(object) {
  const point = object?.userData?.point
  const normal = object?.userData?.normalRaw
  return (
    object.userData?.geoType === 'point_normal_plane_group' &&
    vectorMatches(point, EXERCISE_1.planePoint) &&
    vectorMatches(normal, EXERCISE_1.planeNormal)
  )
}

function workspaceHasPointPVector(workspace) {
  if (!workspace) return false
  return POINT_VECTOR_BLOCK_TYPES.some((type) => (
    workspace.getBlocksByType(type, false).some((block) => blockMatchesVec3(block, EXERCISE_1.pointP))
  ))
}

function isExercise1PlaneBlock(block) {
  return (
    block?.type === 'parametric_plane' &&
    blockMatchesVec3(getInputBlock(block, 'point'), EXERCISE_1.planePoint) &&
    blockMatchesVec3(getInputBlock(block, 'norm'), EXERCISE_1.planeNormal)
  )
}

function isExercise1PointQBlock(block) {
  return (
    block?.type === 'geo_show_point_on_object' &&
    isExercise1PlaneBlock(getInputBlock(block, 'OBJECT'))
  )
}

function isPointPBlock(block) {
  return blockMatchesVec3(block, EXERCISE_1.pointP)
}

function isExercise1NormalVectorBlock(block) {
  return blockMatchesVec3(block, EXERCISE_1.planeNormal)
}

function isExercise1PointDifferenceBlock(block) {
  return (
    block?.type === 'vector_arithmetic' &&
    block.getFieldValue('OP') === 'subtract' &&
    isPointPBlock(getInputBlock(block, 'U')) &&
    isExercise1PointQBlock(getInputBlock(block, 'V'))
  )
}

function objectIsAtPointP(object) {
  const position = object?.userData?.point ?? object?.position
  return (
    position?.isVector3 &&
    closeNumber(position.x, EXERCISE_1.pointP.x) &&
    closeNumber(position.y, EXERCISE_1.pointP.y) &&
    closeNumber(position.z, EXERCISE_1.pointP.z)
  )
}

function createPointPMarker() {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.05 }),
  )

  marker.position.copy(EXERCISE_1.pointP)
  marker.userData.geoType = 'exercise_point_p'
  marker.userData.labelAnchors = {
    p: { type: 'world', position: [EXERCISE_1.pointP.x, EXERCISE_1.pointP.y, EXERCISE_1.pointP.z] },
  }
  marker.userData.labels = [
    { anchor: 'p', text: 'P = [3, 4, 5]', distanceFactor: 8, offset: [0.12, 0.12, 0], color: '#2563eb' },
  ]

  return marker
}

function addExercise1PointPIfNeeded(objects, workspace) {
  if (!workspaceHasPointPVector(workspace)) return objects
  if (objects.some(objectIsAtPointP)) return objects
  return [...objects, createPointPMarker()]
}

function hasExercise1Plane(objects) {
  return objects.some((object) => objectOrChildMatches(object, isExercise1PlaneObject))
}

function hasPointQOnExercise1Plane(objects) {
  return objects.some((object) => (
    object?.userData?.geoType === 'annotated_object' &&
    pointLiesOnExercise1Plane(object.userData.point) &&
    objectOrChildMatches(object, isExercise1PlaneObject)
  ))
}

function hasExercise1PointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isExercise1PointDifferenceBlock)
}

function hasExercise1ProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isExercise1PointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isExercise1NormalVectorBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasExercise1DotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isExercise1PointDifferenceBlock(left) && isExercise1NormalVectorBlock(right)) ||
      (isExercise1NormalVectorBlock(left) && isExercise1PointDifferenceBlock(right))
    )
  })
}

function hasValidExercise1DistanceComputation(workspace) {
  return hasExercise1ProjectionDistanceBlock(workspace) || hasExercise1DotProductDistanceBlock(workspace)
}

function getExercise1DistanceAnswer(objects) {
  const distanceObject = objects.find((object) => (
    object?.userData?.geoType === 'point_plane_distance_dot' ||
    object?.userData?.geoType === 'point_plane_distance_projection_magnitude'
  ))
  const distance = Number(distanceObject?.userData?.distance)
  return Number.isFinite(distance) ? distance : null
}

// ─── Exercise 2 helpers ───────────────────────────────────────────────────────

function isExercise2DirectionBlock(block, direction) {
  return blockMatchesVec3(block, direction)
}

function isExercise2PointBlock(block, point) {
  return blockMatchesVec3(block, point)
}

function isExercise2LineBlock(block, point, direction) {
  return (
    block?.type === 'geo_vector' &&
    isExercise2PointBlock(getInputBlock(block, 'POS'), point) &&
    isExercise2DirectionBlock(getInputBlock(block, 'DIR'), direction)
  )
}

function workspaceHasExercise2Line(workspace, point, direction) {
  if (!workspace) return false
  return workspace.getBlocksByType('geo_vector', false).some((block) => (
    isExercise2LineBlock(block, point, direction)
  ))
}

function isExercise2CrossProductBlock(block) {
  if (block?.type !== 'vector_cross_product') return false
  const u = getInputBlock(block, 'U')
  const v = getInputBlock(block, 'V')
  const forward =
    isExercise2DirectionBlock(u, EXERCISE_2.d1) &&
    isExercise2DirectionBlock(v, EXERCISE_2.d2)
  const swapped =
    isExercise2DirectionBlock(u, EXERCISE_2.d2) &&
    isExercise2DirectionBlock(v, EXERCISE_2.d1)
  return forward || swapped
}

function isExercise2NormalBlock(block) {
  if (isExercise2CrossProductBlock(block)) return true
  // Manual vector equal/parallel to n = (0,0,1) or its opposite
  if (!POINT_VECTOR_BLOCK_TYPES.includes(block?.type)) return false
  const value = new THREE.Vector3(
    Number(block.getFieldValue('X')),
    Number(block.getFieldValue('Y')),
    Number(block.getFieldValue('Z')),
  )
  return vectorsParallel(value, EXERCISE_2.normal)
}

function isExercise2PlaneThroughPointBlock(block, point) {
  return (
    block?.type === 'parametric_plane' &&
    isExercise2PointBlock(getInputBlock(block, 'point'), point) &&
    isExercise2NormalBlock(getInputBlock(block, 'norm'))
  )
}

function isExercise2PlaneBlock(block) {
  return (
    isExercise2PlaneThroughPointBlock(block, EXERCISE_2.p1) ||
    isExercise2PlaneThroughPointBlock(block, EXERCISE_2.p2)
  )
}

function isExercise2PlaneObject(object, throughPoint) {
  const point = object?.userData?.point
  const normal = object?.userData?.normalRaw ?? object?.userData?.normalUnit
  return (
    object.userData?.geoType === 'point_normal_plane_group' &&
    vectorMatches(point, throughPoint, 1e-5) &&
    vectorsParallel(normal, EXERCISE_2.normal)
  )
}

function directionPerpendicularToNormal(direction, normal, tolerance = 1e-5) {
  if (!direction?.isVector3 || !normal?.isVector3) return false
  if (direction.lengthSq() < 1e-12 || normal.lengthSq() < 1e-12) return false
  return Math.abs(direction.clone().normalize().dot(normal.clone().normalize())) <= tolerance
}

function hasExercise2PlaneContainingLine(objects) {
  const planeThroughP1 = objects.some((object) => objectOrChildMatches(object, (child) => (
    isExercise2PlaneObject(child, EXERCISE_2.p1)
  )))
  const planeThroughP2 = objects.some((object) => objectOrChildMatches(object, (child) => (
    isExercise2PlaneObject(child, EXERCISE_2.p2)
  )))
  if (!planeThroughP1 && !planeThroughP2) return false

  // Plane through Pi with normal n contains Li when origin is Pi and di ⟂ n.
  return objects.some((object) => {
    if (object?.userData?.geoType !== 'geo_vector_line') return false
    const origin = object.userData.origin
    const direction = object.userData.direction
    if (!origin?.isVector3 || !direction?.isVector3) return false
    if (!directionPerpendicularToNormal(direction, EXERCISE_2.normal)) return false
    if (planeThroughP1 && vectorMatches(origin, EXERCISE_2.p1, 1e-5) && vectorsParallel(direction, EXERCISE_2.d1)) {
      return true
    }
    if (planeThroughP2 && vectorMatches(origin, EXERCISE_2.p2, 1e-5) && vectorsParallel(direction, EXERCISE_2.d2)) {
      return true
    }
    return false
  })
}

function workspaceHasExercise2CrossProduct(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_cross_product', false).some(isExercise2CrossProductBlock)
}

function workspaceHasExercise2PlaneBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('parametric_plane', false).some(isExercise2PlaneBlock)
}

function isExercise2OffPlanePointBlock(block) {
  // Point not used as the plane's anchor: if plane through P1, use P2; if through P2, use P1.
  return isExercise2PointBlock(block, EXERCISE_2.p1) || isExercise2PointBlock(block, EXERCISE_2.p2)
}

function isExercise2PointDifferenceBlock(block) {
  if (block?.type !== 'vector_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false
  const u = getInputBlock(block, 'U')
  const v = getInputBlock(block, 'V')
  const pair =
    (isExercise2PointBlock(u, EXERCISE_2.p2) && isExercise2PointBlock(v, EXERCISE_2.p1)) ||
    (isExercise2PointBlock(u, EXERCISE_2.p1) && isExercise2PointBlock(v, EXERCISE_2.p2))
  return pair && isExercise2OffPlanePointBlock(u) && isExercise2OffPlanePointBlock(v)
}

function hasExercise2ProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isExercise2PointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isExercise2NormalBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasExercise2DotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isExercise2PointDifferenceBlock(left) && isExercise2NormalBlock(right)) ||
      (isExercise2NormalBlock(left) && isExercise2PointDifferenceBlock(right))
    )
  })
}

function hasExercise2IntersectDistance(objects) {
  return objects.some((object) => {
    if (object?.userData?.geoType !== 'geo_line_intersection') return false
    const distance = Number(object.userData.distance)
    return Number.isFinite(distance) && closeNumber(distance, EXERCISE_2.correctDistance, 0.01)
  })
}

function hasValidExercise2DistanceComputation(workspace, objects) {
  return (
    hasExercise2ProjectionDistanceBlock(workspace) ||
    hasExercise2DotProductDistanceBlock(workspace) ||
    hasExercise2IntersectDistance(objects)
  )
}

function getExercise2DistanceAnswer(objects) {
  const planeDistanceObject = objects.find((object) => (
    object?.userData?.geoType === 'point_plane_distance_dot' ||
    object?.userData?.geoType === 'point_plane_distance_projection_magnitude'
  ))
  if (planeDistanceObject) {
    const distance = Number(planeDistanceObject.userData.distance)
    if (Number.isFinite(distance)) return distance
  }

  const intersection = objects.find((object) => object?.userData?.geoType === 'geo_line_intersection')
  const gap = Number(intersection?.userData?.distance)
  return Number.isFinite(gap) ? gap : null
}

function getExercise2StepCompletion(workspace, objects) {
  const hasLine1 = workspaceHasExercise2Line(workspace, EXERCISE_2.p1, EXERCISE_2.d1)
  const hasLine2 = workspaceHasExercise2Line(workspace, EXERCISE_2.p2, EXERCISE_2.d2)
  const hasCross = workspaceHasExercise2CrossProduct(workspace)
  const hasPlaneBlock = workspaceHasExercise2PlaneBlock(workspace)
  const hasPlaneWithLine = hasExercise2PlaneContainingLine(objects)
  const hasDistance = hasValidExercise2DistanceComputation(workspace, objects)
  const distanceAnswer = getExercise2DistanceAnswer(objects)
  const distanceCorrect = distanceAnswer !== null && closeNumber(distanceAnswer, EXERCISE_2.correctDistance, 0.01)

  return {
    lines: hasLine1 && hasLine2,
    cross: hasCross,
    plane: hasPlaneBlock && hasPlaneWithLine,
    distance: hasDistance && distanceCorrect,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExercisePage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [exerciseIndex, setExerciseIndex] = useState(0)
  const clearWorkspaceRef = useRef(() => {})
  const selectedExercise = EXERCISES[exerciseIndex] ?? EXERCISES[0]

  const isExercise1 = selectedExercise.id === 'point-plane'

  const distanceAnswer = isExercise1
    ? getExercise1DistanceAnswer(objects)
    : getExercise2DistanceAnswer(objects)

  const hasDistanceComputation = isExercise1
    ? hasValidExercise1DistanceComputation(workspace)
    : hasValidExercise2DistanceComputation(workspace, objects)

  const correctDistance = selectedExercise.correctDistance
  const distanceIsCorrect = distanceAnswer !== null && closeNumber(distanceAnswer, correctDistance, 0.01)
  const exercisePassed = distanceIsCorrect && hasDistanceComputation
  const exerciseIncorrect = distanceAnswer !== null && !exercisePassed
  const answerCardClass = `exercise-answer-card${exercisePassed ? ' is-correct' : ''}${exerciseIncorrect ? ' is-incorrect' : ''}`

  const stepCompletion = isExercise1
    ? {
        plane: hasExercise1Plane(objects),
        pointP: workspaceHasPointPVector(workspace),
        pointQ: hasPointQOnExercise1Plane(objects),
        difference: workspaceHasPointPVector(workspace) &&
          hasPointQOnExercise1Plane(objects) &&
          hasExercise1PointDifferenceBlock(workspace),
        distance: exercisePassed,
      }
    : getExercise2StepCompletion(workspace, objects)

  const handleObjectsChange = useCallback(
    (objs) => {
      const exerciseObjects = isExercise1
        ? addExercise1PointPIfNeeded(objs, workspace)
        : objs
      setPendingObjects(exerciseObjects)
      if (autoRender) setObjects(exerciseObjects)
    },
    [autoRender, setPendingObjects, setObjects, workspace, isExercise1],
  )

  const handleSelectExercise = (index) => {
    if (index === exerciseIndex) return
    setExerciseIndex(index)
    setPendingObjects([])
    setObjects([])
  }

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
                  <div className="exercise-selector" role="tablist" aria-label="Exercises">
                    {EXERCISES.map((exercise, index) => (
                      <button
                        key={exercise.id}
                        type="button"
                        role="tab"
                        aria-selected={index === exerciseIndex}
                        className={`exercise-selector__button${index === exerciseIndex ? ' is-active' : ''}`}
                        onClick={() => handleSelectExercise(index)}
                      >
                        {exercise.number}
                      </button>
                    ))}
                  </div>
                  {exercisePassed && <span className="exercise-pass-badge">Passed</span>}
                </div>
                <h1>{selectedExercise.number}. <strong>{selectedExercise.title}</strong></h1>
              </div>

              {isExercise1 ? (
                <>
                  <div className="exercise-given-values" aria-label="Given values">
                    <section>
                      <h3>Plane</h3>
                      <p>Point A = {formatVec(EXERCISE_1.planePoint)}</p>
                      <p>Normal n = {formatVec(EXERCISE_1.planeNormal)}</p>
                    </section>
                    <section>
                      <h3>Point</h3>
                      <p>P = {formatVec(EXERCISE_1.pointP)}</p>
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
                </>
              ) : (
                <>
                  <div className="exercise-given-values" aria-label="Given values">
                    <section>
                      <h3>Line 1</h3>
                      <p>P1 = {formatVec(EXERCISE_2.p1)}</p>
                      <p>d1 = {formatVec(EXERCISE_2.d1)}</p>
                    </section>
                    <section>
                      <h3>Line 2</h3>
                      <p>P2 = {formatVec(EXERCISE_2.p2)}</p>
                      <p>d2 = {formatVec(EXERCISE_2.d2)}</p>
                    </section>
                  </div>

                  <ol className={`exercise-task-steps${exercisePassed ? ' is-passed' : ''}`}>
                    <li className={stepCompletion.lines ? 'is-complete' : ''}>
                      Create both lines using Vector Equation of Line with the given positions and directions.
                    </li>
                    <li className={stepCompletion.cross ? 'is-complete' : ''}>
                      Compute the normal n = d1 × d2 with Cross Product.
                    </li>
                    <li className={stepCompletion.plane ? 'is-complete' : ''}>
                      Make a plane through P1 or P2 with normal n. That plane contains the line you chose.
                    </li>
                    <li className={stepCompletion.distance ? 'is-complete' : ''}>
                      The distance between the skew lines equals the distance from the other line&apos;s point to this plane. Project (P2 − P1) onto n and take Vector Magnitude (or use the dot product — n is a unit vector).
                    </li>
                  </ol>
                </>
              )}

              <div className={answerCardClass}>
                <span>Your answer:</span>
                <strong>{distanceAnswer !== null ? Number(distanceAnswer.toFixed(3)) : ''}</strong>
              </div>
            </aside>
          )}

          <BlocksCanvas
            key={selectedExercise.id}
            id={`exercise-${selectedExercise.id}`}
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
