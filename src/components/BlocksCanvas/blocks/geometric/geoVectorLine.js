import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId) {
  // Pull variables securely from the active window runtime frame
  const THREE = window.THREE
  const threeObjStore = window.threeObjStore
  const useSettingsStore = window.useSettingsStore

  if (!THREE) return null

  const getRawVector = (input) => {
    if (!input) return new THREE.Vector3()
    if (input.isVector3) return input.clone()
    if (input.isObject3D && input.userData?.direction) return input.userData.direction.clone()
    if (input.isObject3D && input.position) return input.position.clone()
    return new THREE.Vector3()
  }

  const origin = getRawVector(posInput)
  let direction = getRawVector(dirInput)
  if (!Number.isFinite(direction.length()) || direction.length() === 0) {
    direction = new THREE.Vector3(1, 0, 0)
  }

  const lineExtent = 20
  const normalised = direction.clone().normalize()
  const p1 = origin.clone().addScaledVector(normalised, -lineExtent)
  const p2 = origin.clone().addScaledVector(normalised, lineExtent)

  const group = new THREE.Group()

  // 1. TECHNIQUE STYLE: Plain Line
  const plainLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([p1, p2]),
    new THREE.LineBasicMaterial({ color: 0x374151 })
  )
  group.add(plainLine)

  // 2. TECHNIQUE STYLE: True Illuminated Line (Zöckler et al. Implementation)
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const lineDirections = new Float32Array([
    normalised.x, normalised.y, normalised.z,
    normalised.x, normalised.y, normalised.z
  ]);
  lineGeometry.setAttribute('lineDir', new THREE.BufferAttribute(lineDirections, 3));

  const illumMaterial = new THREE.ShaderMaterial({
    uniforms: {
      lightPosition: { value: new THREE.Vector3(5, 10, 7).normalize() },
      ambientColor: { value: new THREE.Color(0x222222) },
      diffuseColor: { value: new THREE.Color(0x4b5563) },
      specularColor: { value: new THREE.Color(0xffffff) },
      shininess: { value: 32.0 }
    },
    vertexShader: `
      attribute vec3 lineDir;
      varying vec3 vLineDir;
      varying vec3 vViewPosition;

      void main() {
        vLineDir = normalize(normalMatrix * lineDir);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lightPosition;
      uniform vec3 ambientColor;
      uniform vec3 diffuseColor;
      uniform vec3 specularColor;
      uniform float shininess;

      varying vec3 vLineDir;
      varying vec3 vViewPosition;

      void main() {
        vec3 T = normalize(vLineDir);
        vec3 L = normalize(lightPosition);
        vec3 V = normalize(vViewPosition);

        float dotTL = dot(T, L);
        float diffuseIntensity = sqrt(max(0.0, 1.0 - dotTL * dotTL));

        float dotTV = dot(T, V);
        float specularIntensity = 0.0;
        if (diffuseIntensity > 0.0) {
          float specTerm = dotTL * dotTV + diffuseIntensity * sqrt(max(0.0, 1.0 - dotTV * dotTV));
          specularIntensity = pow(max(0.0, specTerm), shininess);
        }

        vec3 finalColor = ambientColor + (diffuseColor * diffuseIntensity) + (specularColor * specularIntensity);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });

  const illumLine = new THREE.Line(lineGeometry, illumMaterial)
  group.add(illumLine)

  // 3. TECHNIQUE STYLE: Plain Tube (Cylinder)
  const distance = p1.distanceTo(p2)
  const midPoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
  const cylGeom = new THREE.CylinderGeometry(0.015, 0.015, distance, 12)
  const cylMat = new THREE.MeshBasicMaterial({ color: 0x475569 })
  const cylinder = new THREE.Mesh(cylGeom, cylMat)
  cylinder.position.copy(midPoint)
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(cylinder)

  // 4. TECHNIQUE STYLE: Ringed Tube
  const ringedTube = new THREE.Group()

  const baseTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, distance, 16),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.4 })
  )
  ringedTube.add(baseTube)

  const ringGeom = new THREE.CylinderGeometry(0.028, 0.028, 0.15, 16)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.3 })

  const step = 0.3
  const halfDist = distance / 2

  for (let y = -halfDist; y <= halfDist; y += step) {
    const ringSegment = new THREE.Mesh(ringGeom, ringMat)
    ringSegment.position.set(0, y, 0)
    ringedTube.add(ringSegment)
  }

  const capGeom = new THREE.SphereGeometry(0.032, 16, 16)
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.2 })

  const topCap = new THREE.Mesh(capGeom, capMat)
  topCap.position.set(0, halfDist, 0)
  ringedTube.add(topCap)

  const bottomCap = new THREE.Mesh(capGeom, capMat)
  bottomCap.position.set(0, -halfDist, 0)
  ringedTube.add(bottomCap)

  ringedTube.position.copy(midPoint)
  ringedTube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(ringedTube)

  // Direct lookup map pairing style keys
  const glyphMap = {
    plain_line: plainLine,
    illuminated_line: illumLine,
    plain_tube: cylinder,
    ringed_tube: ringedTube
  }

  const applyGlyphVisibility = (activeStyle) => {
    Object.keys(glyphMap).forEach((key) => {
      if (glyphMap[key]) {
        glyphMap[key].visible = (key === activeStyle)
      }
    })
  }

  // FIXED: Look up configurations out of useSettingsStore safely
  const currentSettings = useSettingsStore?.getState().settings || {}
  applyGlyphVisibility(currentSettings.lineStyle || 'plain_line')

  // FIXED: Attach live reactive change subscription handlers targeting the correct store identifier
  if (useSettingsStore) {
    const unsubscribe = useSettingsStore.subscribe((state) => {
      if (!group.parent && threeObjStore && !threeObjStore[blockId]) {
        unsubscribe()
        return
      }
      applyGlyphVisibility(state.settings.lineStyle || 'plain_line')
    })
  }

  const sphereGeom = new THREE.SphereGeometry(0.04, 16, 12)
  const originSphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4, metalness: 0.1 })
  )
  originSphere.position.copy(origin)
  group.add(originSphere)

  if (typeof tRaw !== 'undefined' && Number.isFinite(Number(tRaw))) {
    const tVal = Number(tRaw)
    const rPoint = origin.clone().addScaledVector(direction, tVal)
    const tSphere = new THREE.Mesh(
      sphereGeom,
      new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.4, metalness: 0.1 })
    )
    tSphere.position.copy(rPoint)
    group.add(tSphere)
    group.userData.t = tVal
    group.userData.rPoint = rPoint.clone()
  } else {
    group.userData.t = undefined
    group.userData.rPoint = undefined
  }

  group.userData.geoType = 'geo_vector_line'
  group.userData.origin = origin.clone()
  group.userData.direction = direction.clone()
  group.userData.lineExtent = lineExtent
  group.userData.srcBlockId = blockId

  if (threeObjStore) threeObjStore[blockId] = group
  return group
}

// ==========================================
// 2. BLOCKLY BLOCK DEFINITION
// ==========================================
let REGISTERED = false

export function initVector3Block() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.geo_vector = {
    init() {
      this.appendDummyInput().appendField('Vector Equation of Line')
      this.appendValueInput('POS').appendField('Position:').setCheck('vector3')
      this.appendValueInput('DIR').appendField('Direction:').setCheck('vector3')
      this.appendValueInput('SCALE').appendField('t:').setCheck('scalar')
      this.setTooltip('A line in R3 that passes through a specific point and runs parallel to the direction vector')
      this.setDeletable(true)
      this.setMovable(true)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.CREATE_POINTS_VECTORS)
    },
  }

  javascriptGenerator.forBlock.geo_vector = function(block, generator) {
    const valueToCode = (name) =>
      block.getInput(name) ? generator.valueToCode(block, name, Order.FUNCTION_CALL) : ''

    const vecPos = valueToCode('POS') || 'new window.THREE.Vector3()'
    const vecDir = valueToCode('DIR') || 'new window.THREE.Vector3(1,0,0)'

    const scaleInput = block.getInput('SCALE')
    const hasScaleInput = !!(scaleInput?.connection?.targetConnection)
    const vecScaleCode = hasScaleInput ? (valueToCode('SCALE') || '0') : 'undefined'

    const blockId = JSON.stringify(block.id)

    // FIXED: Cleaned parameters up to leverage our isolated window scope injection securely
    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId})`

    return [code, Order.FUNCTION_CALL]
  }
}
