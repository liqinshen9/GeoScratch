import * as THREE from 'three'

// World-unit bias for the linear-depth comparison below -- comfortably
// smaller than the smallest possible halo margin (HALO_RADIUS - real radius
// = 0.25 world units in geoVectorLine.js, scaled down no further than
// ZOOM_INVARIANT_MIN_SCALE = 0.3, i.e. never below ~0.075) but well above
// float noise.
const DEPTH_BIAS_WORLD_UNITS = 0.02

// Injects the haloed-line discard check into a real (non-inflated) material
// via onBeforeCompile -- see docs/halos-epic-plan.md. Sampling happens at
// the earliest available point in the fragment shader (right after
// #include <clipping_planes_fragment>, present in MeshStandardMaterial's
// shader as the first line of main()) so an occluded fragment discards
// before any lighting/shading work runs on it.
//
// Self-occlusion guard: compares BOTH depth and object identity, not depth
// alone -- a wider inflated companion's near-surface can be nearer than its
// own real surface at silhouette/grazing-angle pixels, which a depth-only
// check can't tell apart from a genuinely different, nearer object.
//
// Depth comparison uses LINEAR view-space Z (three.js's own
// perspectiveDepthToViewZ, from the <packing> chunk MeshStandardMaterial
// already includes), not raw gl_FragCoord.z/depth-texture values directly.
// The scene's camera uses near=0.1/far=5000 -- a 50000:1 ratio -- and
// standard nonlinear perspective depth concentrates nearly all its
// precision within the first few units of the camera; the actual gap
// margin here (~0.25 world units) falls below that precision at any real
// distance, making a raw-depth comparison read as noise once you're more
// than a few units from the crossing. Linear view-space Z has uniform
// precision at any distance, so a single world-unit bias works everywhere.
export function applyHaloDiscardMaterial(material, selfId) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.haloIdTex = { value: null }
    shader.uniforms.haloDepthTex = { value: null }
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

    shader.fragmentShader = `
      uniform sampler2D haloIdTex;
      uniform sampler2D haloDepthTex;
      uniform vec2 haloResolution;
      uniform float selfHaloId;
      uniform float haloCameraNear;
      uniform float haloCameraFar;
      uniform float haloEnabled;
    ` + shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      if (haloEnabled > 0.5) {
        vec2 haloUv = gl_FragCoord.xy / haloResolution;
        float otherId = floor(texture2D(haloIdTex, haloUv).r * 255.0 + 0.5);
        float otherDepth = texture2D(haloDepthTex, haloUv).r;
        // perspectiveDepthToViewZ returns a negative view-space Z; closer
        // to zero means nearer the camera. otherViewZ > selfViewZ (i.e.
        // less negative, by more than the bias) means the OTHER surface is
        // genuinely nearer -- linear, so this holds at any distance.
        float otherViewZ = perspectiveDepthToViewZ(otherDepth, haloCameraNear, haloCameraFar);
        float selfViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, haloCameraNear, haloCameraFar);
        // otherId > 0.5: skip empty/background pixels (cleared to 0).
        // abs(otherId - selfHaloId) > 0.5: skip this object's own inflated
        // companion (self-occlusion guard) -- a wider companion's near
        // surface is nearer than the real surface across its ENTIRE visible
        // cross-section, not just silhouette edges, so this guard matters
        // everywhere, not just at grazing angles.
        if (otherId > 0.5 && abs(otherId - selfHaloId) > 0.5 && otherViewZ > selfViewZ + ${DEPTH_BIAS_WORLD_UNITS.toFixed(4)}) {
          discard;
        }
      }`
    )

    material.userData.haloUniforms = shader.uniforms
  }
  material.needsUpdate = true
}
