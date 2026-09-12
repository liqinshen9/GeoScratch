import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { ANSWER_HIGHLIGHT_COLORS } from '@/store/highlightStyles'
import { ANSWER_GEOMETRY_TYPES } from '@/utils/answerGeometry'

/**
 * Recolours the geometry an exercise names as its answer: green when the value
 * is right, red when it is wrong, its own colour in the Sandbox where there is
 * no answer.
 *
 * Deliberately a recolour rather than the selection glow. The glow lights the
 * surroundings, and on a thin distance bar it washed a large patch of the plane
 * green, which read as "this region" rather than "this bar".
 *
 * The matching `d = ...` label is recoloured separately, by LabelLayer, because
 * a label belongs to the object holding the distance VALUE while the bar
 * belongs to the projection that draws it. See
 * docs/architecture/selection-and-picking.md#the-answer-is-not-where-the-number-is.
 */
export default function AnswerTint({ objects = [], state }) {
  const { invalidate } = useThree()

  useEffect(() => {
    const accent = ANSWER_HIGHLIGHT_COLORS[state]
    if (!accent) return undefined

    // Restore by saved value rather than by recomputing the original: the
    // scene rebuilds on every edit, so the "original" is whatever this run
    // built, not anything derivable here.
    const restores = []
    const visit = (node) => {
      if (!node) return
      if (ANSWER_GEOMETRY_TYPES.has(node.userData?.geoType) && node.material?.color) {
        restores.push({ material: node.material, color: node.material.color.clone() })
        node.material.color.set(accent)
      }
      node.children?.forEach(visit)
    }
    objects.forEach(visit)
    if (!restores.length) return undefined

    invalidate()
    return () => {
      restores.forEach(({ material, color }) => material.color.copy(color))
      invalidate()
    }
  }, [objects, state, invalidate])

  return null
}
