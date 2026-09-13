import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import THREE from '@/utils/three'
import { clearanceAnchor } from './silhouetteClearance'
import { fmtVec, resolveAnchor } from './labelAnchors'
import { LabelAnchor, LabelGroup } from './LabelDeclutter'
import { getLabelVisibilityKey, getLabelsForObject, formatLabelText } from './labelData'
import { ANSWER_HIGHLIGHT_COLORS } from '@/store/highlightStyles'

function LabelLayer({ object3D, hiddenLabelKeys, onHideLabel, labelDetail, answerState }) {
  const camera = useThree((state) => state.camera)
  const ud = object3D.userData || {}
  const derived = getLabelsForObject(object3D)
  //srcBlockId stays stable across scene regenerations (uuid doesn't), so
  //labels keep their identity and settled position across edits.
  const labelIdBase = ud.srcBlockId ?? object3D.uuid

  return (
    <>
      {derived.map((lbl, i) => {
        const visibilityKey = getLabelVisibilityKey(labelIdBase, lbl, i)
        if (hiddenLabelKeys?.has(visibilityKey)) return null

        const pos = resolveAnchor(object3D, lbl.anchor)
        if (!pos) return null

        let text = formatLabelText(lbl, labelDetail)
        if (!text) {
          const val =
            lbl.anchor === 'origin' ? ud.origin : lbl.anchor === 'rPoint' ? ud.rPoint : null
          const fmt = lbl.format || 'vec'
          if (fmt === 'vec' && val) text = fmtVec(val)
          else if (fmt === 'raw' && val) text = String(val)
          else text = ''
        }

        // Deliberately ignore lbl.offset (a small world-space authoring nudge, e.g.
        // [0.12, 0.12, 0]) here: a world-space offset projects to wildly different
        // screen distances depending on camera angle -- sometimes large, sometimes
        // ~0 -- which is exactly the "label is right on the marker from one angle,
        // way off in space from another" bug. BASE_OFFSET_X/Y in LabelDeclutter is
        // the sole, camera-angle-consistent source of separation now; the raw
        // anchor position is what gets projected and sprung away from.
        // A solid's label hangs from its edge. The declutter frame loop keeps it
        // there as the camera moves; this is only the starting point, so a
        // rebuild does not flash the label at the centre.
        const edge = lbl.clearSilhouette
          ? clearanceAnchor(object3D, pos, camera, new THREE.Vector3())
          : null
        const worldPos = edge ? [edge.x, edge.y, edge.z] : pos

        return (
          <LabelGroup key={`lbl-${i}`} id={`${labelIdBase}-${i}`} position={worldPos}>
            <Html>
              <LabelAnchor
                id={`${labelIdBase}-${i}`}
                visibilityKey={visibilityKey}
                className={`label${lbl.emphasis ? ' label--emphasis' : ''}${lbl.className ? ` ${lbl.className}` : ''}`}
                // A distance readout is the answer, so it takes the
                // correctness colour when an exercise has one. The bar it
                // annotates is recoloured to match by AnswerTint.
                color={
                  answerState && lbl.role === 'distance'
                    ? ANSWER_HIGHLIGHT_COLORS[answerState]
                    : lbl.color
                }
                worldPos={worldPos}
                // An animated object moves every frame while labelAnchors are
                // only read on render, so the declutter pass re-resolves from
                // these while something is playing.
                anchorObject={object3D}
                anchorName={lbl.anchor}
                clearObject={lbl.clearSilhouette ? object3D : null}
                emphasis={!!lbl.emphasis}
                onHide={onHideLabel}
              >
                {text}
              </LabelAnchor>
            </Html>
          </LabelGroup>
        )
      })}
    </>
  )
}

export default LabelLayer
