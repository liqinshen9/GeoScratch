import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { createHaloDilateMaterial } from '@/utils/haloDilateShader'
import useSettingsStore from '@/store/useSettingsStore'

// Priority -1: screen-space dilate of HaloDepthPrepass's raw target, right
// after it in the same frame. Output feeds the discard shader via
// HaloUniformSync. See docs/architecture/halos.md.
export default function HaloDilatePass({ rawTarget, onTargetReady }) {
  const { gl } = useThree()
  const haloEnabled = useSettingsStore((s) => s.settings.haloEnabled)

  const material = useMemo(() => createHaloDilateMaterial(), [])
  const quad = useRef(null)
  if (!quad.current) quad.current = new FullScreenQuad(material)

  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      // HalfFloat keeps the depth channel's full precision through the dilate.
      type: THREE.HalfFloatType,
    })
    // Full-canvas value, copied from rawTarget below (HaloUniformSync reads it).
    rt.referenceResolution = new THREE.Vector2(1, 1)
    return rt
  }, [])

  useEffect(() => {
    // Matches the raw target's resolution -- dilate changes which sample
    // wins per texel, not the count.
    if (!rawTarget) return
    target.setSize(rawTarget.width, rawTarget.height)
    target.referenceResolution.copy(rawTarget.referenceResolution)
  }, [target, rawTarget, rawTarget?.width, rawTarget?.height])

  useEffect(() => {
    onTargetReady?.(target)
  }, [target, onTargetReady])

  useEffect(
    () => () => {
      target.dispose()
      material.dispose()
      quad.current?.dispose()
    },
    [target, material],
  )

  useFrame(() => {
    if (!haloEnabled || !rawTarget) return

    material.uniforms.srcIdTex.value = rawTarget.texture
    material.uniforms.srcDepthTex.value = rawTarget.depthTexture
    material.uniforms.texelSize.value.set(1 / rawTarget.width, 1 / rawTarget.height)

    const prevRenderTarget = gl.getRenderTarget()
    gl.setRenderTarget(target)
    quad.current.render(gl)
    gl.setRenderTarget(prevRenderTarget)
  }, -1)

  return null
}
