import { Html } from '@react-three/drei'
import { fmtVec, resolveAnchor } from './labelAnchors'
import { LabelAnchor } from './LabelDeclutter'
import { getLabelVisibilityKey, getLabelsForObject, formatLabelText } from './labelData'

function LabelLayer({ object3D, hiddenLabelKeys, onHideLabel, labelDetail }) {
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
        const worldPos = pos

        return (
          <group key={`lbl-${i}`} position={worldPos}>
            <Html>
              <LabelAnchor
                id={`${labelIdBase}-${i}`}
                visibilityKey={visibilityKey}
                className={`label${lbl.emphasis ? ' label--emphasis' : ''}${lbl.className ? ` ${lbl.className}` : ''}`}
                color={lbl.className ? undefined : lbl.color}
                worldPos={worldPos}
                emphasis={!!lbl.emphasis}
                onHide={onHideLabel}
              >
                {text}
              </LabelAnchor>
            </Html>
          </group>
        )
      })}
    </>
  )
}

export default LabelLayer
