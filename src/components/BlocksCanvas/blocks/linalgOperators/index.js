import { initObjectTransformBlock } from "./objectTransform"
import { initTransformPipelineBlock } from "./transformPipeline"
import { initVectorTransformBlock } from "./vectorTransform"
import { initVectorArithmeticBlock } from "./vectorArithmetic"
import { initScalarArithmeticBlock } from "./scalarArithmetic.js"
import { initDotProductBlock } from "./dotProduct"
import { initCrossProductBlock } from "./vectorCross.js"
import { initMultiplyInplaceBlock } from "./multiplyInplace"
import { initInverseInplaceBlock } from "./inverseInplace"
import { initDeterminantBlock } from "./determinant"
import { initNormInplaceBlock } from "./vectorNormalise.js"
import { initVectorProjectBlock } from "./vectorProject.js"
import { initVectorMagnitude } from "./vectorMagnitude.js"
import { initLineIntersectionBlock } from "./lineIntersection.js"
import { initPointPlaneDistanceBlock } from "./pointPlaneDistance.js"
import { initSphereDistanceBlock } from "./sphereDistance.js"

export function initLinalgOperatorsBlocks() {
  initTransformPipelineBlock()
  initObjectTransformBlock()
  initVectorTransformBlock()
  initVectorArithmeticBlock()
  initScalarArithmeticBlock()
  initDotProductBlock()
  initCrossProductBlock()
  initMultiplyInplaceBlock()
  initInverseInplaceBlock()
  initDeterminantBlock()
  initNormInplaceBlock()
  initVectorProjectBlock()
  initVectorMagnitude()
  initLineIntersectionBlock()
  initPointPlaneDistanceBlock()
  initSphereDistanceBlock()
}
