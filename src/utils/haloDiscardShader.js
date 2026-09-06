import * as THREE from 'three'
import { MAX_IMMUNE_IDS } from './haloIntersectionRegistry'

const DEPTH_BIAS_WORLD_UNITS = 0.01

// Injects the haloed-line discard check into a real (non-inflated) glyph
// material via onBeforeCompile, right after <clipping_planes_fragment> so an
// occluded fragment discards before any shading. Reads HaloDilatePass's
// combined ID+depth target. `immuneIds` is shared by reference with
// haloIntersectionRegistry.js. See docs/architecture/halos.md.
export function applyHaloDiscardMaterial(material, selfId, immuneIds) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.haloTex = { value: null }
    // Must be a real THREE.Vector2, not a plain object.
    // See docs/architecture/halos.md#vector2-uniform.
    shader.uniforms.haloResolution = { value: new THREE.Vector2(1, 1) }
    shader.uniforms.selfHaloId = { value: selfId }
    shader.uniforms.haloCameraNear = { value: 0.1 }
    shader.uniforms.haloCameraFar = { value: 5000 }
    shader.uniforms.haloEnabled = { value: 1.0 }
    shader.uniforms.haloImmuneIds = { value: immuneIds }

    shader.fragmentShader =
      `
      uniform sampler2D haloTex;
      uniform vec2 haloResolution;
      uniform float selfHaloId;
      uniform float haloCameraNear;
      uniform float haloCameraFar;
      uniform float haloEnabled;
      uniform float haloImmuneIds[${MAX_IMMUNE_IDS}];
      // Local copy of three's <packing> perspectiveDepthToViewZ -- LineMaterial
      // omits that chunk. See docs/architecture/halos.md#packing-chunk.
      float haloPerspectiveDepthToViewZ(const in float depth, const in float near, const in float far) {
        return (near * far) / ((far - near) * depth - far);
      }
    ` + shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      if (haloEnabled > 0.5) {
        vec2 haloUv = gl_FragCoord.xy / haloResolution;
        vec4 haloSample = texture2D(haloTex, haloUv);
        float otherId = floor(haloSample.r * 255.0 + 0.5);
        float otherDepth = haloSample.g;
        // Linear view-space Z (negative; closer to 0 = nearer camera), so
        // the comparison holds at any distance.
        // See docs/architecture/halos.md#linear-depth.
        float otherViewZ = haloPerspectiveDepthToViewZ(otherDepth, haloCameraNear, haloCameraFar);
        float selfViewZ = haloPerspectiveDepthToViewZ(gl_FragCoord.z, haloCameraNear, haloCameraFar);
        bool haloImmune = false;
        for (int i = 0; i < ${MAX_IMMUNE_IDS}; i++) {
          if (haloImmuneIds[i] >= 0.0 && abs(otherId - haloImmuneIds[i]) < 0.5) haloImmune = true;
        }
        // otherId > 0.5 skips background; the selfHaloId check is the
        // self-occlusion guard. See docs/architecture/halos.md#self-occlusion.
        if (otherId > 0.5 && !haloImmune && abs(otherId - selfHaloId) > 0.5 && otherViewZ > selfViewZ + ${DEPTH_BIAS_WORLD_UNITS.toFixed(4)}) {
          discard;
        }
      }`,
    )

    material.userData.haloUniforms = shader.uniforms
  }
  material.needsUpdate = true
}
