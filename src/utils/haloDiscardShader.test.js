import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyHaloDiscardMaterial, getHaloUniforms } from './haloDiscardShader'

const fakeShader = () => ({
  uniforms: {},
  fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n}',
})

describe('applyHaloDiscardMaterial', () => {
  // Regression: uniforms used to be created inside onBeforeCompile, so the
  // frame that first compiled a rebuilt line had nothing for HaloUniformSync to
  // fill, and under frameloop="demand" a static scene never drew its halos.
  it('exposes the uniforms before the material has compiled', () => {
    const material = new THREE.MeshBasicMaterial()
    applyHaloDiscardMaterial(material, 3, [-1, -1, -1, -1])
    const uniforms = getHaloUniforms(material)
    expect(uniforms).not.toBeNull()
    expect(uniforms.selfHaloId.value).toBe(3)
    expect(uniforms.haloResolution.value.isVector2).toBe(true)
  })

  it('hands the shader the same uniform objects the sync step writes to', () => {
    const material = new THREE.MeshBasicMaterial()
    const immune = [-1, -1, -1, -1]
    applyHaloDiscardMaterial(material, 5, immune, 1)
    const shader = fakeShader()
    material.onBeforeCompile(shader)
    const uniforms = getHaloUniforms(material)
    for (const key of Object.keys(uniforms)) {
      expect(shader.uniforms[key], key).toBe(uniforms[key])
    }
    expect(shader.uniforms.haloImmuneIds.value).toBe(immune)
    expect(shader.fragmentShader).toContain('discard;')
  })

  it('is null for a material without halos, including a clone of one', () => {
    const material = new THREE.MeshBasicMaterial()
    expect(getHaloUniforms(material)).toBeNull()
    applyHaloDiscardMaterial(material, 1, [-1, -1, -1, -1])
    expect(getHaloUniforms(material.clone())).toBeNull()
    expect(getHaloUniforms(null)).toBeNull()
  })
})
