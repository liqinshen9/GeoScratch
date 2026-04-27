import { useCallback } from 'react'
import BlocksCanvas from '@/components/BlocksCanvas/BlocksCanvas'
import Scene3D from '@/components/Scene3D/Scene3D'
import useSceneStore from '@/store/useSceneStore'

export default function App() {
  const { objects, autoRender, setPendingObjects, setObjects } = useSceneStore()

  const handleObjectsChange = useCallback(
    (objs) => {
      setPendingObjects(objs)
      if (autoRender) setObjects(objs)
    },
    [autoRender, setPendingObjects, setObjects]
  )

  return (
    <div className="grid 2xl:grid-cols-[40%_60%] xl:grid-cols-[40%_60%] lg:grid-cols-[50%_50%] h-full">
      <div className="h-full border-r">
        <BlocksCanvas onObjectsChange={handleObjectsChange} />
      </div>
      <div className="h-full">
        <Scene3D objects={objects} />
      </div>
    </div>
  )
}
