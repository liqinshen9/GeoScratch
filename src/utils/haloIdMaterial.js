import * as THREE from 'three'

// Bare, unlit ID-encoding material for a halo companion mesh. NOT
// MeshBasicMaterial: built-in materials tonemap/colorspace-convert the
// output and corrupt the raw id/255 value. See docs/architecture/halos.md#id-material.
//
// `kind` tags the glyph type in the blue channel (0 = line, 1 = vector) so the
// discard shader can gate line-x-vector crossings behind their own setting.
export function createHaloIdMaterial(id, kind = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { haloId: { value: id }, haloKind: { value: kind } },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float haloId;
      uniform float haloKind;
      void main() {
        gl_FragColor = vec4(haloId / 255.0, 0.0, haloKind, 1.0);
      }
    `,
  })
}
