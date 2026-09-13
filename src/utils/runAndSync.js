import { generateAndRun } from '@/utils/generateAndRun'
import { applyTubeCollisions } from '@/utils/tubeCollision'
import { SCENE_RUN_EVENT } from '@/utils/sceneRunEvent'

const runAndSync = (workspace, onObjectsChange, registry, options = {}) => {
  // Clear the window target object completely before code execution
  window.threeObjStore = {}

  // Run the code generator (mutates window.threeObjStore)
  generateAndRun(workspace, options)

  // Flag vector-line tubes that pass into a solid object so they render ringed there
  applyTubeCollisions(window.threeObjStore)

  // Extract the generated meshes directly from the window container
  const objects = Object.values(window.threeObjStore || {})

  // Reconcile and push to the canvas state scene prop
  registry.reconcile(objects)
  const objectsForScene = registry.list().map((entry) => entry.obj)
  onObjectsChange?.(objectsForScene)

  // See utils/sceneRunEvent.js.
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SCENE_RUN_EVENT))
  }
}

export default runAndSync
