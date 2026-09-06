import THREE from '@/utils/three'
import { collectStatementChain } from '@/utils/sceneHelpers'
import {
  closeNumber,
  blockMatchesVec3,
  getInputBlock,
  scalarInputMatches,
  vectorMatches,
} from './blockQueries'

/**
 * Checks shared by the four transform exercises (1-4): recognising the target
 * teapot, reading a transform pipeline's steps, and comparing a rendered
 * object's pose against an expected transform.
 */

export const TRANSFORM_TEAPOT_CENTRE = new THREE.Vector3(0, 0, 0)
export const TRANSFORM_TEAPOT_SIZE = 1

function isTargetTeapotBlock(block) {
  if (block?.type !== 'geo_teapot') return false
  // An unconnected CENTRE input isn't "missing" -- geoTeapotDefinition falls
  // back to (0,0,0) at runtime, so a bare Teapot block already sits at the
  // target centre without a student needing to wire up a redundant Vector
  // block for it.
  const centreBlock = getInputBlock(block, 'CENTRE')
  const centreMatches = centreBlock
    ? blockMatchesVec3(centreBlock, TRANSFORM_TEAPOT_CENTRE)
    : TRANSFORM_TEAPOT_CENTRE.equals(new THREE.Vector3(0, 0, 0))
  return centreMatches && scalarInputMatches(block, 'SIZE_INPUT', TRANSFORM_TEAPOT_SIZE, 1)
}

function isScaleStepBlock(block, factor) {
  return (
    block?.type === 'scale_matrix' &&
    closeNumber(block.getFieldValue('SX'), factor) &&
    closeNumber(block.getFieldValue('SY'), factor) &&
    closeNumber(block.getFieldValue('SZ'), factor)
  )
}

function isRotateStepBlock(block, axis, degrees) {
  return (
    block?.type === 'rot_matrix' &&
    block.getFieldValue('AXIS') === axis &&
    closeNumber(block.getFieldValue('DEGREES'), degrees)
  )
}

function isTranslateStepBlock(block, tx, ty, tz) {
  return (
    block?.type === 'trans_matrix' &&
    closeNumber(block.getFieldValue('TX'), tx) &&
    closeNumber(block.getFieldValue('TY'), ty) &&
    closeNumber(block.getFieldValue('TZ'), tz)
  )
}

function pipelineTargetsTeapot(pipelineBlock) {
  return (
    pipelineBlock?.type === 'transform_pipeline' &&
    isTargetTeapotBlock(getInputBlock(pipelineBlock, 'INPUT'))
  )
}

function pipelineStepChain(pipelineBlock) {
  return collectStatementChain(pipelineBlock?.getInputTargetBlock?.('STEPS') ?? null)
}

function hasTargetTeapotBlock(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('geo_teapot', false).some(isTargetTeapotBlock)
}

function hasPipelineConnectedToTeapot(workspace) {
  if (!workspace) return false
  return workspace.getBlocksByType('transform_pipeline', false).some(pipelineTargetsTeapot)
}

function hasScaleStepForTeapot(workspace, factor) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('transform_pipeline', false)
    .some(
      (pipeline) =>
        pipelineTargetsTeapot(pipeline) &&
        pipelineStepChain(pipeline).some((step) => isScaleStepBlock(step, factor)),
    )
}

function hasRotateStepForTeapot(workspace, axis, degrees) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('transform_pipeline', false)
    .some(
      (pipeline) =>
        pipelineTargetsTeapot(pipeline) &&
        pipelineStepChain(pipeline).some((step) => isRotateStepBlock(step, axis, degrees)),
    )
}

function hasTranslateStepForTeapot(workspace, tx, ty, tz) {
  if (!workspace) return false
  return workspace
    .getBlocksByType('transform_pipeline', false)
    .some(
      (pipeline) =>
        pipelineTargetsTeapot(pipeline) &&
        pipelineStepChain(pipeline).some((step) => isTranslateStepBlock(step, tx, ty, tz)),
    )
}

function getTransformTargetObject(objects) {
  return (
    objects.find(
      (object) =>
        object?.userData?.geoType === 'geo_teapot' &&
        vectorMatches(object.userData.centre, TRANSFORM_TEAPOT_CENTRE) &&
        closeNumber(object.userData.size, TRANSFORM_TEAPOT_SIZE),
    ) ?? null
  )
}

function quaternionAngleDegrees(qa, qb) {
  const dot = Math.min(1, Math.max(-1, Math.abs(qa.dot(qb))))
  return 2 * Math.acos(dot) * (180 / Math.PI)
}

function scaleMatches(object, factor, tolerance = 0.01) {
  return (
    Boolean(object) &&
    closeNumber(object.scale.x, factor, tolerance) &&
    closeNumber(object.scale.y, factor, tolerance) &&
    closeNumber(object.scale.z, factor, tolerance)
  )
}

function rotationMatches(object, axis, degrees, tolerance = 0.5) {
  if (!object) return false
  const axisVector =
    axis === 'X'
      ? new THREE.Vector3(1, 0, 0)
      : axis === 'Y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1)
  const expectedQuaternion = new THREE.Quaternion().setFromAxisAngle(
    axisVector,
    THREE.MathUtils.degToRad(degrees),
  )
  return closeNumber(quaternionAngleDegrees(object.quaternion, expectedQuaternion), 0, tolerance)
}

function translationMatches(object, tx, ty, tz, tolerance = 0.01) {
  return (
    Boolean(object) &&
    closeNumber(object.position.x, tx, tolerance) &&
    closeNumber(object.position.y, ty, tolerance) &&
    closeNumber(object.position.z, tz, tolerance)
  )
}

export {
  isTargetTeapotBlock,
  pipelineStepChain,
  hasTargetTeapotBlock,
  hasPipelineConnectedToTeapot,
  hasScaleStepForTeapot,
  hasRotateStepForTeapot,
  hasTranslateStepForTeapot,
  getTransformTargetObject,
  scaleMatches,
  rotationMatches,
  translationMatches,
}
