import { initGeometricBlocks } from './geometric'
import { initGeometricVariablesBlocks } from './geometricVariables'
import { initLinalgPrimitivesBlocks } from './linalgPrimitives'
import { initLinalgOperatorsBlocks } from './linalgOperators'
const defineBlocks = () => {
  initGeometricBlocks()
  initGeometricVariablesBlocks()
  initLinalgPrimitivesBlocks()
  initLinalgOperatorsBlocks()
}

defineBlocks() // before palette workspaces inject blocks

export default defineBlocks
