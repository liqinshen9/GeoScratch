import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

// ===================
// 1. RUNTIME THREE.JS
// ===================
function geoVectorLineDefinition(posInput, dirInput, tRaw, blockId, THREE, threeObjStore) {

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
    new THREE.LineBasicMaterial({ color: 0x6b7280 })
  )
  group.add(plainLine)

  // 2. TECHNIQUE STYLE: True Illuminated Line (Zöckler et al. Implementation)
  // We pass the line's own local direction into the vertex shader attributes
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const lineDirections = new Float32Array([
    normalised.x, normalised.y, normalised.z,
    normalised.x, normalised.y, normalised.z
  ]);
  lineGeometry.setAttribute('lineDir', new THREE.BufferAttribute(lineDirections, 3));

  const illumMaterial = new THREE.ShaderMaterial({
    uniforms: {
      lightPosition: { value: new THREE.Vector3(5, 10, 7).normalize() }, // Matches standard scene main light
      ambientColor: { value: new THREE.Color(0x222222) },
      diffuseColor: { value: new THREE.Color(0xffffff) },
      specularColor: { value: new THREE.Color(0xffffff) },
      shininess: { value: 32.0 }
    },
    vertexShader: `
      attribute vec3 lineDir;
      varying vec3 vLineDir;
      varying vec3 vViewPosition;

      void main() {
        // Transform the line direction vector into view space
        vLineDir = normalize(normalMatrix * lineDir);
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lightPosition; // Assumed to be passed in view space or normalized scene space
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

        // Zöckler Diffuse Component: sin(theta) = sqrt(1.0 - dot(T, L)^2)
        float dotTL = dot(T, L);
        float diffuseIntensity = sqrt(max(0.0, 1.0 - dotTL * dotTL));

        // Zöckler Specular Component
        float dotTV = dot(T, V);
        float specularIntensity = 0.0;
        if (diffuseIntensity > 0.0) {
          // Calculate reflection parameter across the fluid cylinder cross-section
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
  const cylMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 })
  const cylinder = new THREE.Mesh(cylGeom, cylMat)
  cylinder.position.copy(midPoint)
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(cylinder)

  // 4. TECHNIQUE STYLE: Ringed Tube (Matched to Reference Image)
  const ringedTube = new THREE.Group()

  // Base core tube - slightly darker gray to contrast with the light rings
  const baseTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, distance, 16),
    new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.4 })
  )
  ringedTube.add(baseTube)

  // Generate a high-density alternating ring pattern running precisely along its local Y axis
  const ringGeom = new THREE.CylinderGeometry(0.028, 0.028, 0.15, 16)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.3 })

  const step = 0.3 // Distance from one ring center to the next
  const halfDist = distance / 2

  for (let y = -halfDist; y <= halfDist; y += step) {
    const ringSegment = new THREE.Mesh(ringGeom, ringMat)
    ringSegment.position.set(0, y, 0)
    ringedTube.add(ringSegment)
  }

  // Add the capping spheres at both tips of the tube to match the vector field look
  const capGeom = new THREE.SphereGeometry(0.032, 16, 16)
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })

  const topCap = new THREE.Mesh(capGeom, capMat)
  topCap.position.set(0, halfDist, 0)
  ringedTube.add(topCap)

  const bottomCap = new THREE.Mesh(capGeom, capMat)
  bottomCap.position.set(0, -halfDist, 0)
  ringedTube.add(bottomCap)

  // Position and rotate the entire compound glyph group into the scene space together
  ringedTube.position.copy(midPoint)
  ringedTube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalised)
  group.add(ringedTube)

  // Direct lookup map pairing current active style keys to their respective meshes
  const glyphMap = {
    plain_line: plainLine,
    illuminated_line: illumLine,
    plain_tube: cylinder,
    ringed_tube: ringedTube
  }

  // Multi-style visibility routing block worker
  const applyGlyphVisibility = (activeStyle) => {
    Object.keys(glyphMap).forEach((key) => {
      if (glyphMap[key]) {
        glyphMap[key].visible = (key === activeStyle)
      }
    })
  }

  // Only make one of the line options visible
  const currentSettings = window.useSceneStore?.getState().settings || {}
  applyGlyphVisibility(currentSettings.lineStyle || 'plain_line')

  // Check for setting changes
  if (window.useSceneStore) {
    const unsubscribe = window.useSceneStore.subscribe((state) => {
      // Self-destruct listener to completely avoid memory leaks if block is deleted
      if (!group.parent && threeObjStore && !threeObjStore[blockId]) {
        unsubscribe()
        return
      }
      applyGlyphVisibility(state.settings.lineStyle || 'plain_line')
    })
  }

  const sphereGeom = new THREE.SphereGeometry(0.05, 16, 12)
  const originSphere = new THREE.Mesh(
    sphereGeom,
    new THREE.MeshStandardMaterial({ color: 0x49a1ff, roughness: 0.4, metalness: 0.1 })
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
      this.appendDummyInput()
        .appendField('Vector Equation of Line')
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

    const vecPos = valueToCode('POS') || 'new THREE.Vector3()'
    const vecDir = valueToCode('DIR') || 'new THREE.Vector3(1,0,0)'

    const scaleInput = block.getInput('SCALE')
    const hasScaleInput = !!(scaleInput?.connection?.targetConnection)
    const vecScaleCode = hasScaleInput ? (valueToCode('SCALE') || '0') : 'undefined'

    const blockId = JSON.stringify(block.id)

    const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ${vecScaleCode}, ${blockId}, THREE, threeObjStore)`

    return [code, Order.FUNCTION_CALL]
  }
}
