import { describe, it, expect } from 'vitest'
import THREE from '@/utils/three'
import { clearanceAnchor } from './silhouetteClearance'

function cameraAt(x, y, z, fov = 50) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000)
  camera.position.set(x, y, z)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

const sphere = (radius) => new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24))

// How far the anchor projects from the centre on screen, against how far the
// object's own vertices project along that same direction.
function screenReaches(mesh, centre, camera) {
  const anchor = clearanceAnchor(mesh, centre, camera, new THREE.Vector3())
  const toScreen = (v) => v.clone().project(camera)
  const c = toScreen(new THREE.Vector3(...centre))
  const a = toScreen(anchor)
  const dir = new THREE.Vector2(a.x - c.x, a.y - c.y)
  const anchorReach = dir.length()
  dir.normalize()
  mesh.updateMatrixWorld()
  const position = mesh.geometry.attributes.position
  let outlineReach = 0
  for (let i = 0; i < position.count; i++) {
    const world = new THREE.Vector3()
      .fromBufferAttribute(position, i)
      .applyMatrix4(mesh.matrixWorld)
    const p = toScreen(world)
    outlineReach = Math.max(outlineReach, (p.x - c.x) * dir.x + (p.y - c.y) * dir.y)
  }
  return { anchor, a, c, anchorReach, outlineReach }
}

describe('clearanceAnchor', () => {
  it('lands on the outline of a sphere, whatever the view', () => {
    for (const camera of [cameraAt(0, 0, 10), cameraAt(7, 5, -3), cameraAt(0, 9, 0.1)]) {
      const { anchorReach, outlineReach } = screenReaches(sphere(1), [0, 0, 0], camera)
      expect(anchorReach).toBeCloseTo(outlineReach, 6)
    }
  })

  it('sits up and to the right of the centre on screen', () => {
    const { a, c } = screenReaches(sphere(1), [0, 0, 0], cameraAt(3, 4, 10))
    expect(a.x).toBeGreaterThan(c.x)
    expect(a.y).toBeGreaterThan(c.y)
  })

  // Close up, perspective spreads the near side of an object well past its 3D
  // extent. Placing the anchor at that extent put a teapot's label inside it.
  it('clears the outline of an object close to the camera and off to the side', () => {
    const mesh = new THREE.Mesh(new THREE.TeapotGeometry(1.5, 6))
    mesh.position.set(-2, -1, 0)
    mesh.rotation.set(2.5, 0.4, 0)
    const { anchorReach, outlineReach } = screenReaches(mesh, [-2, -1, 0], cameraAt(0, -6, 1, 70))
    expect(anchorReach).toBeCloseTo(outlineReach, 6)
  })

  // The anchor is a world point that moves continuously with the camera. That
  // is what keeps it smooth: a screen-space version read label rects a frame
  // behind the camera and threw labels around during fast orbits.
  it('moves continuously as the camera orbits', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
    let previous = null
    let worstStep = 0
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const anchor = clearanceAnchor(
        mesh,
        [0, 0, 0],
        cameraAt(10 * Math.cos(a), 4, 10 * Math.sin(a)),
        new THREE.Vector3(),
      )
      if (previous) worstStep = Math.max(worstStep, anchor.distanceTo(previous))
      previous = anchor
    }
    expect(worstStep).toBeLessThan(0.05)
  })

  it('follows the object transform', () => {
    const mesh = sphere(1)
    mesh.position.set(5, 0, 0)
    mesh.scale.setScalar(2)
    const anchor = clearanceAnchor(mesh, [5, 0, 0], cameraAt(5, 0, 10), new THREE.Vector3())
    expect(anchor.distanceTo(new THREE.Vector3(5, 0, 0))).toBeGreaterThan(1.95)
  })

  it('uses the camera where it is now, not where its matrices last put it', () => {
    const mesh = sphere(1)
    const camera = cameraAt(0, 0, 10)
    camera.position.set(0, 0, 4)
    // No updateMatrixWorld: OrbitControls leaves the camera in this state.
    const anchor = clearanceAnchor(mesh, [0, 0, 0], camera, new THREE.Vector3())
    // Seen from 4 units, a unit sphere's outline sits at 1/sqrt(16 - 1) * 4.
    expect(anchor.length()).toBeCloseTo(4 / Math.sqrt(15), 2)
  })

  it('handles an orthographic camera', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100)
    camera.position.set(0, 0, 20)
    camera.lookAt(0, 0, 0)
    const anchor = clearanceAnchor(sphere(1), [0, 0, 0], camera, new THREE.Vector3())
    expect(anchor.length()).toBeGreaterThan(0.98)
    expect(anchor.length()).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('returns null for an object without geometry or a centre behind the camera', () => {
    const camera = cameraAt(0, 0, 5)
    expect(clearanceAnchor(new THREE.Group(), [0, 0, 0], camera, new THREE.Vector3())).toBe(null)
    expect(clearanceAnchor(sphere(1), [0, 0, 20], camera, new THREE.Vector3())).toBe(null)
  })
})
