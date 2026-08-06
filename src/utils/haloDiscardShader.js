import * as THREE from 'three'
import { MAX_IMMUNE_IDS } from './haloIntersectionRegistry'

// World-unit bias for the linear-depth comparison below -- small, since the
// screen-space dilate step (haloDilateShader.js/HaloDilatePass.jsx) is what
// provides the actual margin now; this just needs to clear float/quantization
// noise at the boundary, not carry the whole visible gap size the way the
// old pure-3D-inflation approach's bias did.
const DEPTH_BIAS_WORLD_UNITS = 0.01

// Injects the haloed-line discard check into a real (non-inflated) material
// via onBeforeCompile -- see docs/halos-epic-plan.md. Sampling happens at
// the earliest available point in the fragment shader (right after
// #include <clipping_planes_fragment>, present in MeshStandardMaterial's
// shader as the first line of main()) so an occluded fragment discards
// before any lighting/shading work runs on it.
//
// Reads HaloDilatePass's single combined target (R: winning object's id,
// G: that object's raw depth) -- NOT HaloDepthPrepass's raw target directly.
// The dilate step is what makes the margin a constant SCREEN-SPACE pixel
// radius instead of a 3D-geometry-based one: the old approach (inflating
// each object's own companion mesh in world space) made the gap's length
// scale with 1/sin(crossing angle) -- at a shallow crossing angle, that
// margin elongates into a long, sharp sliver instead of a short, consistent
// cut. A 2D pixel-radius margin is isotropic regardless of 3D angle.
//
// Self-occlusion guard: compares BOTH depth and object identity, not depth
// alone -- a wider inflated companion's near-surface can be nearer than its
// own real surface at silhouette/grazing-angle pixels, which a depth-only
// check can't tell apart from a genuinely different, nearer object.
//
// Depth comparison uses LINEAR view-space Z (three.js's own
// perspectiveDepthToViewZ, from the <packing> chunk MeshStandardMaterial
// already includes), not the raw nonlinear depth value directly -- the
// scene's camera uses near=0.1/far=5000 (a 50000:1 ratio), and standard
// perspective depth concentrates nearly all its precision within the first
// few units of the camera, so a raw-depth comparison reads as noise past
// that. Linear view-space Z has uniform precision at any distance.
//
// `immuneIds` is a plain array (length MAX_IMMUNE_IDS, unused slots -1),
// shared by reference with haloIntersectionRegistry.js -- when a later line
// turns out to genuinely intersect this one, the registry mutates this same
// array in place, and since three.js re-uploads array uniforms every frame
// regardless of reference equality, that update reaches the GPU on the next
// frame with no extra wiring needed here.
export function applyHaloDiscardMaterial(material, selfId, immuneIds) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.haloTex = { value: null }
    // A real THREE.Vector2, not a plain {x,y} object -- three.js's uniform
    // uploader checks `.isVector2` to decide how to upload a vec2 uniform;
    // a plain object silently uploads as garbage/zero, which divides
    // gl_FragCoord.xy by zero below and produces NaN/Inf UVs.
    shader.uniforms.haloResolution = { value: new THREE.Vector2(1, 1) }
    shader.uniforms.selfHaloId = { value: selfId }
    shader.uniforms.haloCameraNear = { value: 0.1 }
    shader.uniforms.haloCameraFar = { value: 5000 }
    // Lets the Settings > Halos toggle disable the effect instantly for
    // already-built lines, without needing a scene regeneration -- synced
    // live by HaloUniformSync alongside the other halo uniforms.
    shader.uniforms.haloEnabled = { value: 1.0 }
    // Ids of OTHER lines this one genuinely intersects in 3D (see
    // haloIntersectionRegistry.js/lineIntersection.js) -- two distinct
    // straight lines that truly touch can only meet at that one point
    // (they're coplanar), so it's exact and safe to ignore occlusion
    // between an immune pair everywhere, not just near the touch point.
    shader.uniforms.haloImmuneIds = { value: immuneIds }

    shader.fragmentShader = `
      uniform sampler2D haloTex;
      uniform vec2 haloResolution;
      uniform float selfHaloId;
      uniform float haloCameraNear;
      uniform float haloCameraFar;
      uniform float haloEnabled;
      uniform float haloImmuneIds[${MAX_IMMUNE_IDS}];
    ` + shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      if (haloEnabled > 0.5) {
        vec2 haloUv = gl_FragCoord.xy / haloResolution;
        vec4 haloSample = texture2D(haloTex, haloUv);
        float otherId = floor(haloSample.r * 255.0 + 0.5);
        float otherDepth = haloSample.g;
        // perspectiveDepthToViewZ returns a negative view-space Z; closer
        // to zero means nearer the camera. otherViewZ > selfViewZ (i.e.
        // less negative, by more than the bias) means the OTHER surface is
        // genuinely nearer -- linear, so this holds at any distance.
        float otherViewZ = perspectiveDepthToViewZ(otherDepth, haloCameraNear, haloCameraFar);
        float selfViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, haloCameraNear, haloCameraFar);
        bool haloImmune = false;
        for (int i = 0; i < ${MAX_IMMUNE_IDS}; i++) {
          if (haloImmuneIds[i] >= 0.0 && abs(otherId - haloImmuneIds[i]) < 0.5) haloImmune = true;
        }
        // otherId > 0.5: skip empty/background pixels (cleared to 0).
        // abs(otherId - selfHaloId) > 0.5: skip this object's own inflated
        // companion (self-occlusion guard) -- still needed even with the
        // dilate step, since a wider companion's near surface is nearer
        // than the real surface across its own visible cross-section.
        if (otherId > 0.5 && !haloImmune && abs(otherId - selfHaloId) > 0.5 && otherViewZ > selfViewZ + ${DEPTH_BIAS_WORLD_UNITS.toFixed(4)}) {
          discard;
        }
      }`
    )

    material.userData.haloUniforms = shader.uniforms
  }
  material.needsUpdate = true
}
