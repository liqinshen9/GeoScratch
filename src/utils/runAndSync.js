import { generateAndRun } from '@/utils/generateAndRun'

const runAndSync = (workspace, onObjectsChange, registry) => {
  // Clear the window target object completely before code execution
  window.threeObjStore = {}

  // Run the code generator (mutates window.threeObjStore)
  generateAndRun(workspace)

  // Extract the generated meshes directly from the window container
  const objects = Object.values(window.threeObjStore || {})

  // Reconcile and push to the canvas state scene prop
  registry.reconcile(objects)
  const objectsForScene = registry.list().map((entry) => entry.obj)
  onObjectsChange?.(objectsForScene)
}

export default runAndSync
