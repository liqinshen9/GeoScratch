import * as THREE from 'three'

// Kernel radius in texels of the (downsampled) raw prepass target -- the
// actual on-screen margin this produces is roughly
// KERNEL_RADIUS / HALO_TARGET_SCALE (HaloDepthPrepass.jsx) canvas pixels,
// e.g. 8 texels / 1.0 scale = ~8 canvas pixels of radius -- doubled from 4
// alongside HALO_TARGET_SCALE going 0.5 -> 1.0, so the margin size on screen
// is unchanged, only its resolution (and so how blocky its edge looks) is. A
// constant PIXEL radius, unlike the old 3D-geometry-based margin, is
// isotropic: it doesn't elongate at shallow line-crossing angles, and
// dominates the (now deliberately tiny) residual 3D margin's own shape. See
// docs/halos-epic-plan.md.
const KERNEL_RADIUS = 8

// Fullscreen "dilate" pass: for each output texel, looks at a small
// neighborhood of the raw ID+depth target and keeps whichever sample is
// nearest the camera (smallest depth) -- a standard morphological dilate,
// same technique used for outline/edge growing in other post-process
// pipelines. This is what actually produces the constant-pixel-width halo
// margin; the companion mesh's own 3D inflation (geoVectorLine.js) is kept
// deliberately small now, just enough to avoid self/edge artifacts.
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
        // R: winning object's id, re-encoded the same id/255 way the raw
        // pass encodes it (so the discard shader's decode logic is
        // unchanged). G: that object's raw (nonlinear) depth, carried
        // through as a plain color value -- HalfFloatType storage (see
        // HaloDilatePass.jsx) keeps full precision, no 8-bit quantization
        // of depth the way the ID channel deliberately has.
        gl_FragColor = vec4(bestId / 255.0, bestDepth, 0.0, 1.0);
      }
    `,
  })
}
