import * as THREE from 'three'

// Bare, unlit material for a halo companion mesh's ID encoding. Deliberately
// NOT MeshBasicMaterial -- built-in materials' fragment shaders include
// tonemapping_fragment/colorspace_fragment chunks that would distort the
// raw id/255 value before haloDiscardShader.js reads it back. A from-scratch
// ShaderMaterial with no chunk includes writes gl_FragColor untouched.
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
