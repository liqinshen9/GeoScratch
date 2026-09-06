import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { createHaloDilateMaterial } from '@/utils/haloDilateShader'
import useSettingsStore from '@/store/useSettingsStore'

// Runs the screen-space dilate step (see haloDilateShader.js) on
// HaloDepthPrepass's raw ID+depth target, every frame right after it (needs
// a lower priority number than HaloDepthPrepass's -2, so it reads a
// same-frame-fresh source, not last frame's) -- see docs/halos-epic-plan.md.
// Output is what HaloUniformSync actually feeds to the discard shader; the
// raw (pre-dilate) target is never sampled directly by anything else.
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
      // HalfFloat so the depth channel (G) keeps its full [0,1] precision
      // through the dilate step -- unlike the ID channel, this isn't a
      // small discrete value that tolerates 8-bit quantization.
      type: THREE.HalfFloatType,
    })
    // Propagated from rawTarget below -- HaloUniformSync reads this target's
    // own referenceResolution, so it needs the same full-canvas value
    // rawTarget carries, not this target's (also downsampled) pixel size.
    rt.referenceResolution = new THREE.Vector2(1, 1)
    return rt
  }, [])

  useEffect(() => {
    // Matches the raw target's own (already-downsampled) resolution exactly
    // -- the dilate step doesn't change resolution, only which sample "wins"
    // per texel.
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
