import { useCallback, useRef, useState } from 'react'
import * as THREE from 'three'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import EditorColumnHeaders from '@/components/EditorShell/EditorColumnHeaders'
import { ArrowLeft, ArrowRight } from '@icon-park/react'
import useSceneStore from '@/store/useSceneStore'
import useWorkspaceStore from '@/store/useWorkspaceStore'

import '@/components/EditorShell/editor-shell.css'
import './ExercisePage.css'

const POINT_P = new THREE.Vector3(3, 4, 5)
const PLANE_POINT_A = new THREE.Vector3(1, 1, 2)
const PLANE_NORMAL = new THREE.Vector3(0, 1, 0)
const CORRECT_DISTANCE = 3
const POINT_VECTOR_BLOCK_TYPES = ['linalg_vec3', 'linalg_point']

const SKEW_LINE_1_POINT = new THREE.Vector3(1, 2, 0)
const SKEW_LINE_1_DIRECTION = new THREE.Vector3(1, 2, 3)
const SKEW_LINE_2_POINT = new THREE.Vector3(5, 5, -3)
const SKEW_LINE_2_DIRECTION = new THREE.Vector3(2, -1, 1)
const SKEW_NORMAL = new THREE.Vector3().crossVectors(SKEW_LINE_1_DIRECTION, SKEW_LINE_2_DIRECTION)
const SKEW_DISTANCE = Math.abs(
  SKEW_LINE_2_POINT.clone().sub(SKEW_LINE_1_POINT).dot(SKEW_NORMAL),
) / SKEW_NORMAL.length()
const SPHERE_A_CENTRE = new THREE.Vector3(-4, 2, 1)
const SPHERE_B_CENTRE = new THREE.Vector3(3, -1, 6)
const SPHERE_A_RADIUS = 1.3
const SPHERE_B_RADIUS = 0.9
const SPHERE_DISTANCE = Math.max(
  0,
  SPHERE_A_CENTRE.distanceTo(SPHERE_B_CENTRE) - SPHERE_A_RADIUS - SPHERE_B_RADIUS,
)
const EXERCISES = [
  {
    number: 1,
    title: 'Calculate distance from point P to a plane',
  },
  {
    number: 2,
    title: 'Calculate the shortest distance between two skew lines',
  },
  {
    number: 3,
    title: 'Calculate the distance between two spheres',
  },
]
const POINT_PLANE_DISTANCE_BLOCK_XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="point_plane_distance" x="0" y="0"></block></xml>'
const LINE_INTERSECTION_3D_BLOCK_XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="line_intersection_3d" x="0" y="0"></block></xml>'
const SPHERE_DISTANCE_BLOCK_XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="sphere_distance" x="0" y="0"></block></xml>'

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

function vec3FromBlock(block) {
  if (!POINT_VECTOR_BLOCK_TYPES.includes(block?.type)) return null
  const x = Number(block.getFieldValue('X'))
  const y = Number(block.getFieldValue('Y'))
  const z = Number(block.getFieldValue('Z'))
  return [x, y, z].every(Number.isFinite) ? new THREE.Vector3(x, y, z) : null
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

function vectorsAreParallel(a, b, tolerance = 1e-6) {
  return (
    a?.isVector3 &&
    b?.isVector3 &&
    a.lengthSq() > tolerance &&
    b.lengthSq() > tolerance &&
    new THREE.Vector3().crossVectors(a, b).length() <= tolerance * a.length() * b.length()
  )
}

function pointBlockLiesOnLine(block, linePoint, lineDirection, tolerance = 1e-6) {
  if (
    block?.type === 'geo_show_point_on_object' &&
    isLineBlock(getInputBlock(block, 'OBJECT'), linePoint, lineDirection)
  ) {
    return true
  }

  const point = vec3FromBlock(block)
  if (!point) return false
  return new THREE.Vector3()
    .crossVectors(point.clone().sub(linePoint), lineDirection)
    .length() <= tolerance * Math.max(1, lineDirection.length())
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

function isLineBlock(block, point, direction) {
  return (
    block?.type === 'geo_vector' &&
    blockMatchesVec3(getInputBlock(block, 'POS'), point) &&
    blockMatchesVec3(getInputBlock(block, 'DIR'), direction)
  )
}

function isSkewLine1Block(block) {
  return isLineBlock(block, SKEW_LINE_1_POINT, SKEW_LINE_1_DIRECTION)
}

function isSkewLine2Block(block) {
  return isLineBlock(block, SKEW_LINE_2_POINT, SKEW_LINE_2_DIRECTION)
}

function isSphereBlock(block, centre, radius) {
  return (
    block?.type === 'geo_sphere' &&
    blockMatchesVec3(getInputBlock(block, 'CENTRE'), centre) &&
    closeNumber(block.getFieldValue('RADIUS'), radius)
  )
}

function isSphereABlock(block) {
  return isSphereBlock(block, SPHERE_A_CENTRE, SPHERE_A_RADIUS)
}

function isSphereBBlock(block) {
  return isSphereBlock(block, SPHERE_B_CENTRE, SPHERE_B_RADIUS)
}

function isSkewCrossProductBlock(block) {
  if (block?.type !== 'vector_cross_product') return false
  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  const isLine1Direction = (inputBlock) => blockMatchesVec3(inputBlock, SKEW_LINE_1_DIRECTION) || isSkewLine1Block(inputBlock)
  const isLine2Direction = (inputBlock) => blockMatchesVec3(inputBlock, SKEW_LINE_2_DIRECTION) || isSkewLine2Block(inputBlock)
  return (
    (isLine1Direction(left) && isLine2Direction(right)) ||
    (isLine2Direction(left) && isLine1Direction(right))
  )
}

function isSkewNormalBlock(block) {
  return vectorsAreParallel(vec3FromBlock(block), SKEW_NORMAL) || isSkewCrossProductBlock(block)
}

function getSkewPlaneLine(block) {
  if (
    block?.type === 'parametric_plane' &&
    isSkewNormalBlock(getInputBlock(block, 'norm')) &&
    pointBlockLiesOnLine(getInputBlock(block, 'point'), SKEW_LINE_1_POINT, SKEW_LINE_1_DIRECTION)
  ) {
    return 'line1'
  }

  if (
    block?.type === 'parametric_plane' &&
    isSkewNormalBlock(getInputBlock(block, 'norm')) &&
    pointBlockLiesOnLine(getInputBlock(block, 'point'), SKEW_LINE_2_POINT, SKEW_LINE_2_DIRECTION)
  ) {
    return 'line2'
  }

  return null
}

function isSkewPlaneBlock(block) {
  return Boolean(getSkewPlaneLine(block))
}

function isPointOnObjectBlock(block, objectPredicate) {
  return block?.type === 'geo_show_point_on_object' && objectPredicate(getInputBlock(block, 'OBJECT'))
}

function isPointOnSkewPlaneBlock(block) {
  return isPointOnObjectBlock(block, isSkewPlaneBlock)
}

function isPointOnOtherSkewLineBlock(block, planeLine) {
  return isPointOnObjectBlock(block, planeLine === 'line1' ? isSkewLine2Block : isSkewLine1Block)
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

function isSkewPointDifferenceBlock(block) {
  if (block?.type !== 'vector_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false

  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  const leftIsPlanePoint = isPointOnSkewPlaneBlock(left)
  const rightIsPlanePoint = isPointOnSkewPlaneBlock(right)
  const planePointBlock = leftIsPlanePoint ? left : rightIsPlanePoint ? right : null
  const otherPointBlock = leftIsPlanePoint ? right : rightIsPlanePoint ? left : null

  const planeLine = getSkewPlaneLine(getInputBlock(planePointBlock, 'OBJECT'))
  return Boolean(planeLine && isPointOnOtherSkewLineBlock(otherPointBlock, planeLine))
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

function hasSkewLineBlocks(workspace) {
  if (!workspace) return false
  const lines = workspace.getBlocksByType('geo_vector', false)
  return lines.some(isSkewLine1Block) && lines.some(isSkewLine2Block)
}

function hasSkewCrossProductBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_cross_product', false).some(isSkewCrossProductBlock)
}

function hasSkewPlaneBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('parametric_plane', false).some(isSkewPlaneBlock)
}

function hasSkewOtherLinePointBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('geo_show_point_on_object', false).some((block) => {
    const planeBlocks = workspace.getBlocksByType('parametric_plane', false).filter(isSkewPlaneBlock)
    return planeBlocks.some((planeBlock) => isPointOnOtherSkewLineBlock(block, getSkewPlaneLine(planeBlock)))
  })
}

function hasSkewPointDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isSkewPointDifferenceBlock)
}

function hasSkewProjectionDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => {
    const projectBlock = getInputBlock(block, 'V')
    return (
      projectBlock?.type === 'vector_project' &&
      isSkewPointDifferenceBlock(getInputBlock(projectBlock, 'U')) &&
      isSkewNormalBlock(getInputBlock(projectBlock, 'V'))
    )
  })
}

function hasSkewDotProductDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_dot_product', false).some((block) => {
    const left = getInputBlock(block, 'U')
    const right = getInputBlock(block, 'V')
    return (
      (isSkewPointDifferenceBlock(left) && isSkewNormalBlock(right)) ||
      (isSkewNormalBlock(left) && isSkewPointDifferenceBlock(right))
    )
  })
}

function isSkewReusableDistanceBlock(block) {
  if (block?.type !== 'point_plane_distance') return false

  const planeBlock = getInputBlock(block, 'PLANE')
  const planeLine = getSkewPlaneLine(planeBlock)
  return Boolean(planeLine && isPointOnOtherSkewLineBlock(getInputBlock(block, 'POINT'), planeLine))
}

function hasSkewReusableDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('point_plane_distance', false).some(isSkewReusableDistanceBlock)
}

function hasValidSkewDistanceComputation(workspace) {
  return (
    hasSkewProjectionDistanceBlock(workspace) ||
    hasSkewDotProductDistanceBlock(workspace) ||
    hasSkewReusableDistanceBlock(workspace)
  )
}

function hasSphereBlocks(workspace) {
  if (!workspace) return false
  const spheres = workspace.getBlocksByType('geo_sphere', false)
  return spheres.some(isSphereABlock) && spheres.some(isSphereBBlock)
}

function isSphereCenterDifferenceBlock(block) {
  if (block?.type !== 'vector_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false
  const left = getInputBlock(block, 'U')
  const right = getInputBlock(block, 'V')
  return (
    (blockMatchesVec3(left, SPHERE_B_CENTRE) && blockMatchesVec3(right, SPHERE_A_CENTRE)) ||
    (blockMatchesVec3(left, SPHERE_A_CENTRE) && blockMatchesVec3(right, SPHERE_B_CENTRE))
  )
}

function hasSphereCenterDifferenceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_arithmetic', false).some(isSphereCenterDifferenceBlock)
}

function hasSphereCenterMagnitudeBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('vector_magnitude', false).some((block) => (
    isSphereCenterDifferenceBlock(getInputBlock(block, 'V'))
  ))
}

function isSphereCenterMagnitudeBlock(block) {
  return block?.type === 'vector_magnitude' && isSphereCenterDifferenceBlock(getInputBlock(block, 'V'))
}

function getSphereRadiusScalar(block) {
  if (block?.type !== 'scalar') return null
  if (closeNumber(block.getFieldValue('scalar'), SPHERE_A_RADIUS)) return 'a'
  if (closeNumber(block.getFieldValue('scalar'), SPHERE_B_RADIUS)) return 'b'
  return null
}

function isSphereRadiusSumBlock(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'add') return false
  const leftRadius = getSphereRadiusScalar(getInputBlock(block, 'A'))
  const rightRadius = getSphereRadiusScalar(getInputBlock(block, 'B'))
  return new Set([leftRadius, rightRadius]).size === 2 && leftRadius !== null && rightRadius !== null
}

function getCenterMinusOneRadius(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'subtract') return null
  if (!isSphereCenterMagnitudeBlock(getInputBlock(block, 'A'))) return null
  return getSphereRadiusScalar(getInputBlock(block, 'B'))
}

function isSphereScalarDistanceBlock(block) {
  if (block?.type !== 'scalar_arithmetic' || block.getFieldValue('OP') !== 'subtract') return false

  if (
    isSphereCenterMagnitudeBlock(getInputBlock(block, 'A')) &&
    isSphereRadiusSumBlock(getInputBlock(block, 'B'))
  ) {
    return true
  }

  const firstSubtractedRadius = getCenterMinusOneRadius(getInputBlock(block, 'A'))
  const secondSubtractedRadius = getSphereRadiusScalar(getInputBlock(block, 'B'))
  return Boolean(
    firstSubtractedRadius &&
    secondSubtractedRadius &&
    firstSubtractedRadius !== secondSubtractedRadius,
  )
}

function hasSphereScalarDistanceBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('scalar_arithmetic', false).some(isSphereScalarDistanceBlock)
}

function blockTreeContains(block, predicate, visited = new Set()) {
  if (!block || visited.has(block.id)) return false
  visited.add(block.id)
  if (predicate(block)) return true
  return (block.inputList || []).some((input) => (
    blockTreeContains(input.connection?.targetBlock?.(), predicate, visited)
  ))
}

function isSphereScalarDistanceCandidateBlock(block) {
  if (block?.type !== 'scalar_arithmetic') return false
  return (
    blockTreeContains(getInputBlock(block, 'A'), isSphereCenterMagnitudeBlock) ||
    blockTreeContains(getInputBlock(block, 'B'), isSphereCenterMagnitudeBlock)
  )
}

function hasValidSphereDistanceComputation(workspace) {
  return (
    hasSphereBlocks(workspace) &&
    hasSphereCenterDifferenceBlock(workspace) &&
    hasSphereCenterMagnitudeBlock(workspace) &&
    hasSphereScalarDistanceBlock(workspace)
  )
}

function getScalarAnswerFromWorkspace(objects, workspace, blockPredicate) {
  if (!workspace) return null
  const scalarObject = objects.find((object) => {
    if (object?.userData?.geoType !== 'scalar_arithmetic_result') return false
    const sourceBlock = workspace.getBlockById?.(object.userData?.srcBlockId)
    return blockPredicate(sourceBlock)
  })
  const value = Number(scalarObject?.userData?.value)
  return Number.isFinite(value) ? value : null
}

function getDistanceAnswer(objects, expectedDistance = null, workspace = null, options = {}) {
  if (options.isSphereExercise) {
    const sphereScalarAnswer = getScalarAnswerFromWorkspace(
      objects,
      workspace,
      isSphereScalarDistanceCandidateBlock,
    )
    if (sphereScalarAnswer !== null) return sphereScalarAnswer
  }

  if (options.isSkewExercise) {
    const lineIntersectionAnswer = objects.find((object) => (
      object?.userData?.geoType === 'geo_line_intersection'
    ))
    const distance = Number(lineIntersectionAnswer?.userData?.distance)
    if (Number.isFinite(distance)) return distance
  }

  const distanceObject = objects.find((object) => (
    object?.userData?.geoType === 'point_plane_distance_dot' ||
    object?.userData?.geoType === 'point_plane_distance_projection_magnitude' ||
    object?.userData?.geoType === 'sphere_sphere_distance'
  ))
  const scalarObjects = objects.filter((object) => object?.userData?.geoType === 'scalar_arithmetic_result')
  const scalarAnswer = Number.isFinite(expectedDistance)
    ? scalarObjects.find((object) => closeNumber(object.userData?.value, expectedDistance, 0.01))
    : scalarObjects[0]
  const distance = Number(distanceObject?.userData?.distance ?? scalarAnswer?.userData?.value)
  return Number.isFinite(distance) ? distance : null
}

export default function ExercisePage() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()
  const { workspace } = useWorkspaceStore()
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false)
  const [activeExercise, setActiveExercise] = useState(1)
  const clearWorkspaceRef = useRef(() => {})
  const activeExerciseConfig = EXERCISES.find(({ number }) => number === activeExercise) ?? EXERCISES[0]
  const previousExercise = EXERCISES.toReversed().find(({ number }) => number < activeExerciseConfig.number)
  const nextExercise = EXERCISES.find(({ number }) => number > activeExerciseConfig.number)
  const isSkewExercise = activeExerciseConfig.number === 2
  const isSphereExercise = activeExerciseConfig.number === 3
  const expectedDistance = isSkewExercise ? SKEW_DISTANCE : isSphereExercise ? SPHERE_DISTANCE : CORRECT_DISTANCE
  const distanceAnswer = getDistanceAnswer(objects, expectedDistance, workspace, { isSkewExercise, isSphereExercise })
  const hasDistanceComputation = isSkewExercise
    ? hasValidSkewDistanceComputation(workspace)
    : isSphereExercise
      ? hasValidSphereDistanceComputation(workspace)
      : hasValidDistanceComputation(workspace)
  const distanceIsCorrect = distanceAnswer !== null && closeNumber(distanceAnswer, expectedDistance, 0.01)
  const exercisePassed = distanceIsCorrect && hasDistanceComputation
  const answerIncorrect = distanceAnswer !== null && !distanceIsCorrect
  const answerCardClass = `exercise-answer-card${distanceIsCorrect ? ' is-correct' : ''}${answerIncorrect ? ' is-incorrect' : ''}`
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
  const skewStepCompletion = {
    lines: hasSkewLineBlocks(workspace),
    normal: hasSkewCrossProductBlock(workspace),
    plane: hasSkewPlaneBlock(workspace),
    point: hasSkewOtherLinePointBlock(workspace) || hasSkewReusableDistanceBlock(workspace),
    difference: hasSkewPointDifferenceBlock(workspace) || hasSkewReusableDistanceBlock(workspace),
    distance: exercisePassed,
  }
  const sphereStepCompletion = {
    spheres: hasSphereBlocks(workspace),
    difference: hasSphereCenterDifferenceBlock(workspace),
    magnitude: hasSphereCenterMagnitudeBlock(workspace),
    distance: hasSphereScalarDistanceBlock(workspace) && exercisePassed,
  }
  const reusableBlockTemplate = exercisePassed
    ? activeExerciseConfig.number === 1
      ? {
      defaultName: 'Distance from point to plane',
      description: 'Save a reusable distance block with open inputs for any point and any plane.',
      source: 'exercise',
      xmlText: POINT_PLANE_DISTANCE_BLOCK_XML,
    }
      : activeExerciseConfig.number === 2
        ? {
      defaultName: 'Intersect 3D lines',
      description: 'Save a reusable Intersect 3D block with open inputs for any two vector lines.',
      source: 'exercise',
      xmlText: LINE_INTERSECTION_3D_BLOCK_XML,
    }
        : {
      defaultName: 'Distance between spheres',
      description: 'Save a reusable sphere distance block with open inputs for any two spheres.',
      source: 'exercise',
      xmlText: SPHERE_DISTANCE_BLOCK_XML,
    }
    : null

  const handleSelectExercise = useCallback((exerciseNumber) => {
    setActiveExercise(exerciseNumber)
    setWorkspaceMaximized(false)
    setPendingObjects([])
    setObjects([])
  }, [setObjects, setPendingObjects])

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
          leadingHeader={
            <div className="exercise-column-heading">
              <h2>Exercise</h2>
              <div className="exercise-column-heading__actions" aria-label="Exercise navigation">
                <button
                  type="button"
                  className="exercise-nav-button"
                  onClick={() => previousExercise && handleSelectExercise(previousExercise.number)}
                  disabled={!previousExercise}
                  title="Previous exercise"
                  aria-label="Previous exercise"
                >
                  <ArrowLeft theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="exercise-nav-button"
                  onClick={() => nextExercise && handleSelectExercise(nextExercise.number)}
                  disabled={!nextExercise}
                  title="Next exercise"
                  aria-label="Next exercise"
                >
                  <ArrowRight theme="outline" size="13" fill="currentColor" aria-hidden="true" />
                </button>
              </div>
            </div>
          }
          workspace={workspace}
          workspaceMaximized={workspaceMaximized}
          onWorkspaceMaximizedChange={setWorkspaceMaximized}
          onClearWorkspace={() => clearWorkspaceRef.current()}
        />

        <div className="editor-body-row">
          {!workspaceMaximized && (
            <aside className={`exercise-task-panel${exercisePassed ? ' is-passed' : ''}`}>
              <div className="exercise-task-panel__top">
                {exercisePassed && (
                  <div className="exercise-task-panel__meta-row">
                    <span className="exercise-pass-badge">Passed</span>
                  </div>
                )}
                <h1>
                  {activeExerciseConfig.number}: <strong>{activeExerciseConfig.title}</strong>
                </h1>
              </div>

              {isSkewExercise ? (
                <>
                  <div className="exercise-given-values" aria-label="Given values">
                    <section>
                      <h3>Line L1</h3>
                      <p>P1 = (1, 2, 0)</p>
                      <p>d1 = (1, 2, 3)</p>
                    </section>
                    <section>
                      <h3>Line L2</h3>
                      <p>P2 = (5, 5, -3)</p>
                      <p>d2 = (2, -1, 1)</p>
                    </section>
                  </div>

                  <ol className={`exercise-task-steps${exercisePassed ? ' is-passed' : ''}`}>
                    <li className={skewStepCompletion.lines ? 'is-complete' : ''}>
                      Create: L1, L2 with Vector Equation of Line blocks.
                    </li>
                    <li className={skewStepCompletion.normal ? 'is-complete' : ''}>
                      Compute: n = d1 x d2. This normal is perpendicular to both line directions.
                    </li>
                    <li className={skewStepCompletion.plane ? 'is-complete' : ''}>
                      Create: helper plane from any point on L1 or L2 and normal n. The chosen line should lie in the plane.
                    </li>
                    <li className={skewStepCompletion.point ? 'is-complete' : ''}>
                      Create: any point on the other line.
                    </li>
                    <li className={skewStepCompletion.difference ? 'is-complete' : ''}>
                      Use the point on the other line as the point input, and use the helper plane as the plane input.
                    </li>
                    <li className={skewStepCompletion.distance ? 'is-complete' : ''}>
                      Calculate the distance from that point to that helper plane.
                    </li>
                  </ol>
                </>
              ) : isSphereExercise ? (
                <>
                  <div className="exercise-given-values" aria-label="Given values">
                    <section>
                      <h3>Sphere A</h3>
                      <p>Center A = (-4, 2, 1)</p>
                      <p>Radius rA = 1.3</p>
                    </section>
                    <section>
                      <h3>Sphere B</h3>
                      <p>Center B = (3, -1, 6)</p>
                      <p>Radius rB = 0.9</p>
                    </section>
                  </div>

                  <ol className={`exercise-task-steps${exercisePassed ? ' is-passed' : ''}`}>
                    <li className={sphereStepCompletion.spheres ? 'is-complete' : ''}>
                      Create: Sphere A, Sphere B, Center A, Center B. Please use Point blocks for the centers so the center-to-center vector draws in the right place.
                    </li>
                    <li className={sphereStepCompletion.difference ? 'is-complete' : ''}>
                      Compute: center difference with the Vector Arithmetic block, B - A or A - B. This vector should run from one sphere center to the other.
                    </li>
                    <li className={sphereStepCompletion.magnitude ? 'is-complete' : ''}>
                      Compute: center distance with the Vector Magnitude block, |B - A|.
                    </li>
                    <li className={sphereStepCompletion.distance ? 'is-complete' : ''}>
                      Compute: sphere distance with the Scalar Arithmetic block, i.e., |B - A| - rA - rB.
                    </li>
                  </ol>
                </>
              ) : (
                <>
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
                      Create: plane
                    </li>
                    <li className={stepCompletion.pointP ? 'is-complete' : ''}>
                      Create: Point P
                    </li>
                    <li className={stepCompletion.pointQ ? 'is-complete' : ''}>
                      Create: any point Q on the plane
                    </li>
                    <li className={stepCompletion.difference ? 'is-complete' : ''}>
                      Compute: P - Q with the Vector Arithmetic block.
                    </li>
                    <li className={stepCompletion.distance ? 'is-complete' : ''}>
                      Compute: distance by projecting P - Q onto n and taking Vector Magnitude. Alternatively, you can use the dot product of (P - Q) and n because n is a unit vector. This gives the distance from P to the plane.
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
            key={`exercise-${activeExercise}`}
            id={`exercise-${activeExercise}`}
            workspaceMaximized={workspaceMaximized}
            reusableBlockTemplate={reusableBlockTemplate}
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
