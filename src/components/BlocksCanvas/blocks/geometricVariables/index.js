import { initGetObj3DBlock } from './getObj3D'
import { initSetObj3DBlock } from './setObj3D'
import { initSetVector3VarBlock, initGetVector3VarBlock } from './vector3Variable'
import { initSetScalarVarBlock, initGetScalarVarBlock } from './scalarVariable'
import { initVariableWrapperBlocks } from './variableWrapper'

export function initGeometricVariablesBlocks() {
  // The typed set/get pairs are no longer offered in the palette (the
  // wrapper + reference replaced that flow), but stay REGISTERED so any
  // workspace already saved with them still loads.
  initGetObj3DBlock()
  initSetObj3DBlock()
  initSetVector3VarBlock()
  initGetVector3VarBlock()
  initSetScalarVarBlock()
  initGetScalarVarBlock()
  initVariableWrapperBlocks()
}
