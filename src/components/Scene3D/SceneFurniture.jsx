import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Billboard } from '@react-three/drei'
import THREE from '@/utils/three'
import { AXIS_COLORS, AXIS_SHAFT_RADIUS, DESMOS_TICK_COLOR } from './sceneConstants'

// BackSide walls cull the near ones. An edge hides only when BOTH its faces
// are culled. See docs/architecture/render-order.md#boundingboxroom-edge-culling.
function cubeEdges(half) {
  return [
    // edges running along X (y,z fixed) -- border a Y-face and a Z-face
    { faces: ['NY', 'NZ'], a: [-half, -half, -half], b: [half, -half, -half] },
    { faces: ['NY', 'PZ'], a: [-half, -half, half], b: [half, -half, half] },
    { faces: ['PY', 'NZ'], a: [-half, half, -half], b: [half, half, -half] },
    { faces: ['PY', 'PZ'], a: [-half, half, half], b: [half, half, half] },
    // edges running along Y (x,z fixed) -- border an X-face and a Z-face
    { faces: ['NX', 'NZ'], a: [-half, -half, -half], b: [-half, half, -half] },
    { faces: ['NX', 'PZ'], a: [-half, -half, half], b: [-half, half, half] },
    { faces: ['PX', 'NZ'], a: [half, -half, -half], b: [half, half, -half] },
    { faces: ['PX', 'PZ'], a: [half, -half, half], b: [half, half, half] },
    // edges running along Z (x,y fixed) -- border an X-face and a Y-face
    { faces: ['NX', 'NY'], a: [-half, -half, -half], b: [-half, -half, half] },
    { faces: ['NX', 'PY'], a: [-half, half, -half], b: [-half, half, half] },
    { faces: ['PX', 'NY'], a: [half, -half, -half], b: [half, -half, half] },
    { faces: ['PX', 'PY'], a: [half, half, -half], b: [half, half, half] },
  ]
}

// A face is culled ("open") when the camera is beyond its plane.
function openFaces(cameraPosition, half) {
  const { x, y, z } = cameraPosition
  return {
    PX: x > half,
    NX: x < -half,
    PY: y > half,
    NY: y < -half,
    PZ: z > half,
    NZ: z < -half,
  }
}

function BoundingBoxRoom({ size = 40, showFrontWireframe = true }) {
  const half = size / 2
  const edges = useMemo(() => cubeEdges(half), [half])
  const edgeRefs = useRef([])

  useFrame(({ camera }) => {
    const open = showFrontWireframe ? null : openFaces(camera.position, half)
    edges.forEach((edge, i) => {
      const obj = edgeRefs.current[i]
      if (!obj) return
      const [f1, f2] = edge.faces
      obj.visible = !open || !(open[f1] && open[f2])
    })
  })

  return (
    <group>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial color="#ffffff" side={THREE.BackSide} roughness={1} />
      </mesh>
      {edges.map((edge, i) => (
        <line
          key={i}
          ref={(el) => {
            edgeRefs.current[i] = el
          }}
        >
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([...edge.a, ...edge.b]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#a3a3a3" transparent opacity={0.42} depthWrite={false} />
        </line>
      ))}
    </group>
  )
}

function AxisArrow({
  dir = [1, 0, 0],
  color = AXIS_COLORS.x,
  length = 3,
  opacity = 0.82,
  showLabel = true,
}) {
  const arrowGroup = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize()
    const group = new THREE.Group()
    // Emissive keeps the axis color readable from any angle.
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.3,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    const headHeight = 0.62
    const shaftStart = -length
    const shaftEnd = length
    const shaftLength = Math.max(0.1, shaftEnd - shaftStart)
    // Radius under 0.0272 so a coincident line wins the depth test (#43).
    // See docs/architecture/render-order.md#axis-shaft-radius-ceiling.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(AXIS_SHAFT_RADIUS, AXIS_SHAFT_RADIUS, shaftLength, 12),
      material,
    )
    shaft.position.copy(direction).multiplyScalar((shaftStart + shaftEnd) / 2)
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, headHeight, 18), material)
    head.position.copy(direction).multiplyScalar(length - headHeight / 2)
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)

    // Fixed renderOrder pins the axis to always draw first.
    // See docs/architecture/render-order.md#scenefurniture-fixed-render-orders.
    shaft.renderOrder = -100
    head.renderOrder = -100

    group.add(shaft, head)
    return group
  }, [dir, color, length, opacity])

  const tip = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize()
    return d.multiplyScalar(length + 0.55)
  }, [dir, length])

  return (
    <group>
      <primitive object={arrowGroup} />
      {showLabel && (
        <Billboard position={[tip.x, tip.y, tip.z]}>
          <Text
            fontSize={0.52}
            color={color}
            fillOpacity={opacity}
            anchorX="center"
            anchorY="middle"
          >
            {dir[0] ? 'x' : dir[1] ? 'y' : 'z'}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

// Collar rings at each interval -- visible from any camera angle.
function AxisTicks({
  dir = [1, 0, 0],
  color = AXIS_COLORS.x,
  length = 3,
  step = 5,
  showLabels = true,
}) {
  const { ticksGroup, labelPositions } = useMemo(() => {
    const direction = new THREE.Vector3(...dir).normalize()
    const perpOffset = dir[0] ? new THREE.Vector3(0, 0, 0.3) : new THREE.Vector3(0.3, 0, 0)
    const group = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 })
    const ringGeom = new THREE.TorusGeometry(0.05, 0.007, 8, 20)
    const positions = []

    for (let t = step; t <= length; t += step) {
      for (const sign of [1, -1]) {
        const at = t * sign
        const ring = new THREE.Mesh(ringGeom, material)
        ring.position.copy(direction).multiplyScalar(at)
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
        group.add(ring)
        positions.push({ t: at, pos: direction.clone().multiplyScalar(at).add(perpOffset) })
      }
    }

    return { ticksGroup: group, labelPositions: positions }
  }, [dir, color, length, step])

  return (
    <group>
      <primitive object={ticksGroup} />
      {showLabels &&
        labelPositions.map(({ t, pos }) => (
          <Billboard key={t} position={[pos.x, pos.y, pos.z]}>
            <Text fontSize={0.3} color={color} fillOpacity={0.75} anchorX="center" anchorY="middle">
              {t}
            </Text>
          </Billboard>
        ))}
    </group>
  )
}

// A small marker where the axes cross, instead of a stray "0" digit.
function OriginMarker({ radius = 0.06, color = DESMOS_TICK_COLOR, showLabel = false }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.15} />
      </mesh>
      {showLabel && (
        <Billboard position={[0.14, 0.14, 0]}>
          <Text fontSize={0.26} color={color} fillOpacity={0.85} anchorX="left" anchorY="bottom">
            O
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function Axes({
  length = 3,
  showTicks = true,
  tickStep = 5,
  showOriginLabel = false,
  showScaleLabels = true,
  showEndLabels = true,
}) {
  return (
    <group>
      <OriginMarker showLabel={showOriginLabel} />
      <AxisArrow
        dir={[1, 0, 0]}
        color={AXIS_COLORS.x}
        length={length}
        opacity={0.82}
        showLabel={showEndLabels}
      />
      <AxisArrow
        dir={[0, 1, 0]}
        color={AXIS_COLORS.y}
        length={length}
        opacity={0.82}
        showLabel={showEndLabels}
      />
      <AxisArrow
        dir={[0, 0, 1]}
        color={AXIS_COLORS.z}
        length={length}
        opacity={0.82}
        showLabel={showEndLabels}
      />
      {showTicks && (
        <>
          <AxisTicks
            dir={[1, 0, 0]}
            color={AXIS_COLORS.x}
            length={length}
            step={tickStep}
            showLabels={showScaleLabels}
          />
          <AxisTicks
            dir={[0, 1, 0]}
            color={AXIS_COLORS.y}
            length={length}
            step={tickStep}
            showLabels={showScaleLabels}
          />
          <AxisTicks
            dir={[0, 0, 1]}
            color={AXIS_COLORS.z}
            length={length}
            step={tickStep}
            showLabels={showScaleLabels}
          />
        </>
      )}
    </group>
  )
}

const GRID_OPACITY = 0.18

function FadedGrid() {
  const gridRef = useRef(null)

  useLayoutEffect(() => {
    if (!gridRef.current) return
    const materials = Array.isArray(gridRef.current.material)
      ? gridRef.current.material
      : [gridRef.current.material]

    materials.forEach((material, index) => {
      material.transparent = true
      material.opacity =
        index === 0 ? Math.min(0.44, GRID_OPACITY * 1.7) : Math.min(0.28, GRID_OPACITY * 0.9)
      material.depthWrite = false
      material.color.set(index === 0 ? 0xb0b0b0 : 0xd2d2d2)
      material.needsUpdate = true
    })
  }, [])

  return (
    <gridHelper
      ref={gridRef}
      args={[40, 40, 0xb0b0b0, 0xd2d2d2]}
      position={[0, -0.005, 0]}
      renderOrder={-1}
    />
  )
}

export { BoundingBoxRoom, Axes, FadedGrid }
