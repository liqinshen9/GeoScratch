import * as THREE from 'three'

const PLANE_EXTENT = 2000

const infinitePlaneVertexShader = /* glsl */ `
  varying vec2 vLocalPos;
  void main() {
    vLocalPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const infinitePlaneFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  varying vec2 vLocalPos;

  void main() {
    float dist = length(vLocalPos);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
    if (fade <= 0.001) discard;
    gl_FragColor = vec4(uColor, uOpacity * fade);
  }
`

/**
 * Creates a large plane mesh with soft radial fade so it reads as infinite.
 */
export function createInfinitePlaneMesh({
  color = 0xffb6c1,
  opacity = 0.14,
  fadeStart = 8,
  fadeEnd = 48,
} = {}) {
  const geometry = new THREE.PlaneGeometry(PLANE_EXTENT, PLANE_EXTENT, 1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
    },
    vertexShader: infinitePlaneVertexShader,
    fragmentShader: infinitePlaneFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  return mesh
}

//Transform pipeline
function matrix4FromAxisRotationDegrees(axis, degrees) {
  const angle = THREE.MathUtils.degToRad(degrees)
  if (axis === 'Y') return new THREE.Matrix4().makeRotationY(angle)
  if (axis === 'Z') return new THREE.Matrix4().makeRotationZ(angle)
  return new THREE.Matrix4().makeRotationX(angle)
}

/**
 * @param {import('blockly/core').Block | null} block
 * @param {{ fallbackToIdentity?: boolean }} [options]
 */
export function matrix4FromTransformStepBlock(block, { fallbackToIdentity = false } = {}) {
  if (!block) return fallbackToIdentity ? new THREE.Matrix4() : null

  if (block.type === 'rot_matrix') {
    const axis = block.getFieldValue('AXIS') || 'X'
    const degrees = Number(block.getFieldValue('DEGREES')) || 0
    return matrix4FromAxisRotationDegrees(axis, degrees)
  }

  if (block.type === 'trans_matrix') {
    const tx = Number(block.getFieldValue('TX')) || 0
    const ty = Number(block.getFieldValue('TY')) || 0
    const tz = Number(block.getFieldValue('TZ')) || 0
    return new THREE.Matrix4().makeTranslation(tx, ty, tz)
  }

  if (block.type === 'scale_matrix') {
    const sx = Number(block.getFieldValue('SX')) || 1
    const sy = Number(block.getFieldValue('SY')) || 1
    const sz = Number(block.getFieldValue('SZ')) || 1
    return new THREE.Matrix4().makeScale(sx, sy, sz)
  }

  return fallbackToIdentity ? new THREE.Matrix4() : null
}

/** @param {import('blockly/core').Block | null} startBlock */
export function collectStatementChain(startBlock) {
  const chain = []
  let cursor = startBlock
  while (cursor) {
    chain.push(cursor)
    cursor = cursor.getNextBlock()
  }
  return chain
}

export function applyWorldMatrix4ToObject(object, matrix) {
  if (!(matrix?.isMatrix4)) return
  const parentWorld = object.parent?.matrixWorld?.clone() ?? new THREE.Matrix4()
  const parentWorldInverse = parentWorld.clone().invert()
  const localMatrix = parentWorldInverse.multiply(matrix).multiply(parentWorld.clone())
  object.applyMatrix4(localMatrix)
}

export function matrix4ToRowMajor(matrix) {
  const e = matrix.elements
  return [
    [e[0], e[4], e[8], e[12]],
    [e[1], e[5], e[9], e[13]],
    [e[2], e[6], e[10], e[14]],
    [e[3], e[7], e[11], e[15]],
  ]
}

export function rowMajor4To3(matrix4) {
  return [
    [matrix4[0][0], matrix4[0][1], matrix4[0][2]],
    [matrix4[1][0], matrix4[1][1], matrix4[1][2]],
    [matrix4[2][0], matrix4[2][1], matrix4[2][2]],
  ]
}
