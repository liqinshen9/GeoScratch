import { generateAndRun } from '@/utils/generateAndRun'
import useThreeStore from '@/store/useThreeStore'

//Clear the object store, run Blockly-generated code, then sync registry → scene
const runAndSync = (workspace, onObjectsChange, registry) => {
  const store = useThreeStore.getState()
  store.clearObjects()

  generateAndRun(workspace)
  const objects = store.getObjectsArray()
  registry.reconcile(objects)
  const objectsForScene = registry.list().map((entry) => entry.obj)
  onObjectsChange?.(objectsForScene)
}

export default runAndSync