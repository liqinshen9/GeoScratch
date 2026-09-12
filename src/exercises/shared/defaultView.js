import { DEFAULT_CAMERA_POSITION } from '@/components/Scene3D/sceneConstants'

/**
 * Distance from a world point to the scene's default (reset) camera.
 *
 * The perceptual exercises derive their answer key from this at module load,
 * so it reads the real camera constant instead of a copy of its numbers -- a
 * changed default view has to move the correct answer with it.
 */
export function distanceToDefaultView([x, y, z]) {
  const [cameraX, cameraY, cameraZ] = DEFAULT_CAMERA_POSITION
  return Math.hypot(cameraX - x, cameraY - y, cameraZ - z)
}

export default distanceToDefaultView
