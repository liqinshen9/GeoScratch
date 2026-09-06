import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_LAYER } from '@/utils/haloLayer'
import useSettingsStore from '@/store/useSettingsStore'

// Downsample factor for the offscreen target. Keep at 1.0 -- lower values
// staircase the margin. See docs/architecture/halos.md#target-scale.
const HALO_TARGET_SCALE = 1.0

// Priority -2: renders HALO_LAYER into the raw offscreen target every frame,
// one step ahead of HaloDilatePass (-1). See docs/architecture/halos.md.
export default function HaloDepthPrepass({ onTargetReady }) {
  const { gl, scene, camera, size } = useThree()
  const haloEnabled = useSettingsStore((s) => s.settings.haloEnabled)

  const target = useMemo(() => {
    // NearestFilter is required: the color channel is a discrete integer ID.
    // See docs/architecture/halos.md#nearest-filter.
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })
    rt.depthTexture = new THREE.DepthTexture(1, 1)
    // Full canvas resolution; the discard shader's UV math needs it even
    // though the target itself is downsampled.
    rt.referenceResolution = new THREE.Vector2(1, 1)
    return rt
  }, [])

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio()
    const fullWidth = Math.max(1, Math.round(size.width * pixelRatio))
    const fullHeight = Math.max(1, Math.round(size.height * pixelRatio))
    const width = Math.max(1, Math.round(fullWidth * HALO_TARGET_SCALE))
    const height = Math.max(1, Math.round(fullHeight * HALO_TARGET_SCALE))
    target.setSize(width, height)
    // setSize skips depthTexture -- resize it by hand or it stays 1x1.
    // See docs/architecture/halos.md#depthtexture-resize.
    target.depthTexture.image.width = width
    target.depthTexture.image.height = height
    target.depthTexture.needsUpdate = true
    target.referenceResolution.set(fullWidth, fullHeight)
  }, [target, gl, size.width, size.height])

  useEffect(() => {
    onTargetReady?.(target)
  }, [target, onTargetReady])

  useEffect(() => () => target.dispose(), [target])

  useFrame(() => {
    // Skips a full extra scene render when off (the real cost). Stale target
    // data is harmless -- the haloEnabled uniform short-circuits the discard.
    if (!haloEnabled) return

    const prevMask = camera.layers.mask
    const prevRenderTarget = gl.getRenderTarget()
    const prevClearColor = gl.getClearColor(new THREE.Color())
    const prevClearAlpha = gl.getClearAlpha()

    camera.layers.set(HALO_LAYER)
    gl.setRenderTarget(target)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(scene, camera)

    gl.setRenderTarget(prevRenderTarget)
    gl.setClearColor(prevClearColor, prevClearAlpha)
    camera.layers.mask = prevMask
  }, -2)

  return null
}
