import * as THREE from 'three'

// On-screen margin is ~KERNEL_RADIUS / HALO_TARGET_SCALE canvas pixels.
// Paired with HALO_TARGET_SCALE (see docs/architecture/halos.md#target-scale).
const KERNEL_RADIUS = 8

// Fullscreen morphological dilate of the raw ID+depth target: per output
// texel, keep the sample nearest the camera. This is what produces the
// constant-pixel-width halo margin. See docs/architecture/halos.md.
export function createHaloDilateMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      srcIdTex: { value: null },
      srcDepthTex: { value: null },
      texelSize: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D srcIdTex;
      uniform sampler2D srcDepthTex;
      uniform vec2 texelSize;
      varying vec2 vUv;

      void main() {
        float bestId = 0.0;
        float bestDepth = 1.0;
        for (int dx = -${KERNEL_RADIUS}; dx <= ${KERNEL_RADIUS}; dx++) {
          for (int dy = -${KERNEL_RADIUS}; dy <= ${KERNEL_RADIUS}; dy++) {
            vec2 uv = vUv + vec2(float(dx), float(dy)) * texelSize;
            float id = floor(texture2D(srcIdTex, uv).r * 255.0 + 0.5);
            float depth = texture2D(srcDepthTex, uv).r;
            if (id > 0.5 && depth < bestDepth) {
              bestDepth = depth;
              bestId = id;
            }
          }
        }
        // R: winning id (id/255, same encoding as the raw pass). G: its raw
        // depth (HalfFloat storage keeps full precision).
        gl_FragColor = vec4(bestId / 255.0, bestDepth, 0.0, 1.0);
      }
    `,
  })
}
