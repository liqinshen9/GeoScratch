import { useFrame, useThree } from '@react-three/fiber'
import useSettingsStore from '@/store/useSettingsStore'

// Pushes HaloDilatePass's dilated target (texture + resolution) into every
// halo-discard material's uniforms -- mirrors Scene3D.jsx's FatLineSync
// pattern (keeping a material's uniforms in sync from outside the sandboxed
// generated-code context that builds it), see docs/halos-epic-plan.md. Runs
// every frame rather than only on objects/target change: onBeforeCompile
// populates a material's userData.haloUniforms lazily, on its first actual
// render, which can land on a different frame than when `objects` last
// changed -- an effect keyed on those props could fire too early and never
// re-run once the uniforms object actually exists. Per-frame cost here is a
// handful of property writes, not a rebuild, so this is cheap regardless.
//
// `target` here is HaloDilatePass's OUTPUT (id in .r, depth in .g of one
// combined texture) -- HaloDepthPrepass's raw target is an intermediate
// step nothing outside HaloDilatePass ever samples.
export default function HaloUniformSync({ objects, target }) {
  const { camera } = useThree()
  const haloEnabled = useSettingsStore((s) => s.settings.haloEnabled)

  useFrame(() => {
    if (!target) return
    objects.forEach((o) => {
      if (!o) return
      o.traverse((child) => {
        const uniforms = child.material?.userData?.haloUniforms
        if (!uniforms) return
        uniforms.haloTex.value = target.texture
        // haloResolution normalizes gl_FragCoord.xy (full CANVAS
        // resolution) into a UV -- it must stay the full-canvas size even
        // though target.width/height are downsampled (HaloDepthPrepass),
        // or every fragment would sample outside the [0,1] UV range.
        uniforms.haloResolution.value.x = target.referenceResolution.x
        uniforms.haloResolution.value.y = target.referenceResolution.y
        uniforms.haloCameraNear.value = camera.near
        uniforms.haloCameraFar.value = camera.far
        uniforms.haloEnabled.value = haloEnabled ? 1.0 : 0.0
      })
    })
  })

  return null
}
