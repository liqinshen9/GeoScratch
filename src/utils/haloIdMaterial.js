import * as THREE from 'three'

// Bare, unlit ID-encoding material for a halo companion mesh. NOT
// MeshBasicMaterial: built-in materials tonemap/colorspace-convert the
// output and corrupt the raw id/255 value. See docs/architecture/halos.md#id-material.
export function createHaloIdMaterial(id) {
  return new THREE.ShaderMaterial({
    uniforms: { haloId: { value: id } },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float haloId;
      void main() {
        gl_FragColor = vec4(haloId / 255.0, 0.0, 0.0, 1.0);
      }
    `,
  })
}
