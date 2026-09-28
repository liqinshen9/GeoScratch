import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { ANSWER_HIGHLIGHT_COLORS } from '@/store/highlightStyles'
import { ANSWER_GEOMETRY_TYPES } from '@/utils/answerGeometry'
import { applyGlow } from './highlightEffects'

/**
 * Glows the geometry an exercise names as its answer: green when the value is
 * right, red when it is wrong, nothing in the Sandbox where there is no answer.
 * It is the selection glow's line halo in the answer's colour, so the bar keeps
 * its own (neutral) colour and the verdict reads as light around it.
 *
 * The matching `d = ...` label is recoloured separately, by LabelLayer, because
 * a label belongs to the object holding the distance VALUE while the bar
 * belongs to the projection that draws it. See
 * docs/architecture/selection-and-picking.md#the-answer-is-not-where-the-number-is.
 */
export default function AnswerTint({ objects = [], state }) {
  const { scene, size, invalidate } = useThree()

  useEffect(() => {
    const accent = ANSWER_HIGHLIGHT_COLORS[state]
    if (!accent) return undefined

    const targets = []
    const visit = (node) => {
      if (!node) return
      if (ANSWER_GEOMETRY_TYPES.has(node.userData?.geoType)) {
        targets.push(node)
        return
      }
      node.children?.forEach(visit)
    }
    objects.forEach(visit)
    if (!targets.length) return undefined

    // A distance bar is a cylinder along its local Y; the line halo needs its
    // two ends. The scene rebuilds on every edit, so this is never stale.
    targets.forEach((target) => {
      const height = target.geometry?.parameters?.height
      if (Number.isFinite(height)) {
        target.userData.glowLine = {
          start: new THREE.Vector3(0, -height / 2, 0),
          end: new THREE.Vector3(0, height / 2, 0),
        }
      }
    })

    const glow = applyGlow(targets, scene, size, accent)
    invalidate()
    return () => {
      glow.restore()
      invalidate()
    }
  }, [objects, state, scene, size, invalidate])

  return null
}
