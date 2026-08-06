import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_LAYER } from '@/utils/haloLayer'
import useSettingsStore from '@/store/useSettingsStore'

// Linear downsample factor for the offscreen target. Was 0.5 (quarter the
// total pixels) until #realtalk: at that resolution, NearestFilter (required
// -- see the target's own comment below) upsamples each texel to a 2x2
// canvas-pixel block, which reads as visible staircasing along the dilated
// margin's boundary on anything wide enough on screen to make a texel-sized
// step noticeable -- an extra-thick tube being the clearest case. 1.0 (full
// canvas resolution, texel:pixel exactly 1:1) removes that upsample step
// entirely; HaloDilateShader's KERNEL_RADIUS is doubled alongside this so the
// actual on-screen margin size (KERNEL_RADIUS / HALO_TARGET_SCALE) stays the
// same as before, not just sharper-edged.
const HALO_TARGET_SCALE = 1.0

// Renders just the HALO_LAYER objects into an offscreen "raw" target every
// frame, before HaloDilatePass (priority -2, one step ahead of its -1, so
// the dilate pass always reads a same-frame-fresh source rather than last
// frame's) -- see docs/halos-epic-plan.md. Color attachment carries a
// per-object halo ID (Phase B's self-occlusion guard); the attached
// DepthTexture carries real hardware depth, in the same gl_FragCoord.z
// convention the dilate/discard shaders compare against, so no manual depth
// encoding is needed here. Nothing samples this target directly except
// HaloDilatePass -- the discard shader only ever sees the dilated result.
export default function HaloDepthPrepass({ onTargetReady }) {
  const { gl, scene, camera, size } = useThree()
  const haloEnabled = useSettingsStore((s) => s.settings.haloEnabled)

  const target = useMemo(() => {
    // NearestFilter, deliberately -- the color channel encodes a DISCRETE
    // integer ID (haloIdRegistry.js). LinearFilter would blend two
    // different objects' IDs together at their boundary in the
    // (now-downsampled) texture, producing a fractional/garbage decoded ID
    // right at edges. Downsampling the target's PIXEL COUNT is fine for
    // this effect's precision needs; blending its ID VALUES is not.
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })
    rt.depthTexture = new THREE.DepthTexture(1, 1)
    // The main pass's discard shader normalizes gl_FragCoord.xy (full CANVAS
    // resolution) into a UV before sampling this target -- texture2D
    // interpolates correctly regardless of the target's OWN pixel
    // dimensions, so downsampling the target itself doesn't require the UV
    // math to change, only this separate reference value to stay at full
    // canvas resolution (see the size effect below).
    rt.referenceResolution = new THREE.Vector2(1, 1)
    return rt
  }, [])

  useEffect(() => {
    const pixelRatio = gl.getPixelRatio()
    // Rounded to integers -- WebGLRenderTarget doesn't validate fractional
    // sizes itself, and a non-integer texel count is meaningless anyway.
    const fullWidth = Math.max(1, Math.round(size.width * pixelRatio))
    const fullHeight = Math.max(1, Math.round(size.height * pixelRatio))
    const width = Math.max(1, Math.round(fullWidth * HALO_TARGET_SCALE))
    const height = Math.max(1, Math.round(fullHeight * HALO_TARGET_SCALE))
    target.setSize(width, height)
    // setSize only resizes target.textures (color attachments) -- the
    // depthTexture is a separate property RenderTarget.setSize doesn't
    // touch, so it needs updating by hand or it stays stuck at 1x1.
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
    // Skip the whole extra scene render when the setting is off -- this is
    // the actual performance cost (a full additional render call every
    // frame), not just a visual toggle. The target keeps whatever it last
    // held, but that's harmless: HaloUniformSync also syncs a haloEnabled
    // uniform that short-circuits the discard shader, so stale target data
    // never gets read while disabled.
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
