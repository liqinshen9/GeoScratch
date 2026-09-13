import { useFrame, useThree } from '@react-three/fiber'
import useSettingsStore from '@/store/useSettingsStore'
import { getHaloUniforms } from '@/utils/haloDiscardShader'

// Every frame, pushes HaloDilatePass's dilated target + camera near/far +
// haloEnabled into every halo-discard material's uniforms. The uniforms exist
// before the material first compiles, so the very first frame after a rebuild
// is already correct. See docs/architecture/halos.md#uniforms-before-first-compile.
export default function HaloUniformSync({ objects, target }) {
  const { camera } = useThree()
  const haloEnabled = useSettingsStore((s) => s.settings.haloEnabled)
  const haloLineVectorEnabled = useSettingsStore((s) => s.settings.haloLineVectorEnabled)

  useFrame(() => {
    if (!target) return
    objects.forEach((o) => {
      if (!o) return
      o.traverse((child) => {
        const uniforms = getHaloUniforms(child.material)
        if (!uniforms) return
        uniforms.haloTex.value = target.texture
        // Full-canvas resolution, not the downsampled target size.
        uniforms.haloResolution.value.x = target.referenceResolution.x
        uniforms.haloResolution.value.y = target.referenceResolution.y
        uniforms.haloCameraNear.value = camera.near
        uniforms.haloCameraFar.value = camera.far
        uniforms.haloEnabled.value = haloEnabled ? 1.0 : 0.0
        if (uniforms.haloCrossTypeEnabled) {
          uniforms.haloCrossTypeEnabled.value = haloLineVectorEnabled === false ? 0.0 : 1.0
        }
      })
    })
  })

  return null
}
