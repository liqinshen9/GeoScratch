import { fmtVec } from './labelAnchors'

/**
 * Derives the label descriptors and visibility keys for a scene object.
 *
 * Kept apart from LabelLayer.jsx because ScenePicker needs these too -- a
 * right-click has to know which labels an object owns before any of them are
 * rendered.
 */

function getLabelVisibilityKey(labelIdBase, lbl, index) {
  return `${labelIdBase}:${lbl.anchor ?? index}:${index}`
}

function getLabelsForObject(object3D) {
  const ud = object3D.userData || {}
  const labels = Array.isArray(ud.labels) ? ud.labels : []
  const needsDefault = labels.length === 0 && ud.geoType === 'geo_vector_line'
  return needsDefault
    ? [
        {
          anchor: 'origin',
          text: `Pos ${fmtVec(ud.origin)}`,
          distanceFactor: 8,
          offset: [0.12, 0.12, 0],
          color: '#2563eb',
        },
        ...(ud.rPoint != null && Number.isFinite(ud.t)
          ? [
              {
                anchor: 'rPoint',
                text: `r(t=${ud.t}) ${fmtVec(ud.rPoint)}`,
                distanceFactor: 8,
                offset: [0.12, 0.12, 0],
                color: '#ffff00',
              },
            ]
          : []),
      ]
    : labels
}

function getLabelVisibilityKeysForObject(object3D) {
  const labelIdBase = object3D.userData?.srcBlockId ?? object3D.uuid
  return getLabelsForObject(object3D).map((label, index) =>
    getLabelVisibilityKey(labelIdBase, label, index),
  )
}

// A label describes either a real object's own identity (`name`, plus an
// optional formatted `value`) or a diagnostic/derived readout that's never
// affected by the detail-level setting (a pre-formatted `text`, e.g. a
// distance measurement or a status message).
function formatLabelText(lbl, labelDetail) {
  if (lbl.text != null) return lbl.text
  if (lbl.name == null) return ''
  return labelDetail === 'nameOnly' ? lbl.name : `${lbl.name} = ${lbl.value ?? ''}`
}

export {
  getLabelVisibilityKey,
  getLabelsForObject,
  getLabelVisibilityKeysForObject,
  formatLabelText,
}
