import { useFrame, useThree } from '@react-three/fiber'
import useSettingsStore from '@/store/useSettingsStore'

// Every frame, pushes HaloDilatePass's dilated target + camera near/far +
// haloEnabled into every halo-discard material's uniforms. Per-frame (not an
// effect) because onBeforeCompile populates userData.haloUniforms lazily on
// first render. See docs/architecture/halos.md.
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
        // Full-canvas resolution, not the downsampled target size.
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
