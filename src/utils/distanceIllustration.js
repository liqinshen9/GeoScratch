import { buildVectorShaftGlyph } from '@/utils/vectorShaftGlyph'
import { createPointMarker } from '@/utils/pointMarker'

// The picture drawn for a point-to-plane distance: the plane's normal, a dashed
// guide along the plane, and a right angle where the perpendicular meets it.
//
// It lived in three places -- vector_project, point_plane_distance and the dot
// product's codegen -- and they drifted. Two still anchored the perpendicular at
// the wrong point after the third was fixed, and the dot product's copy kept
// references to variables a migration had deleted, so its distance branch threw
// at runtime. One copy, published to builders as window.buildDistanceIllustration.
//
// Colours arrive as arguments rather than being looked up here: importing the
// colour system pulls in @material/material-color-utilities, which does not
// resolve under vitest, and every caller already has window.GeoScratchColors.
//
// See docs/architecture/animation.md and selection-and-picking.md.

// Enough to clear the distance bar's radius (0.022) plus the glyph's tube
// (~0.051). Fixed rather than scaled by the distance, which threw the normal
// further sideways the longer the distance got.
const NORMAL_SIDE_CLEARANCE = 0.08

const GUIDE_DASH = { dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.82 }

/**
 * @param {object} THREE            The augmented THREE the caller is using.
 * @param {object} opts
 * @param {string} opts.blockId     Owning block, for srcBlockId and store keys.
 * @param {object} opts.foot        Vector3 where the perpendicular meets the plane.
 * @param {object} opts.normal      Vector3 plane normal; its magnitude is drawn.
 * @param {object} [opts.guideTo]   Vector3 the dashed guide runs to along the
 *   plane. Omitted, or coincident with the foot, draws no guide.
 * @param {number} opts.distanceLength  The distance itself, for marker sizing.
 * @param {string|number} opts.normalColor
 * @param {string|number} opts.accentColor   Guide line and right-angle marker.
 * @param {string|number} [opts.footDotColor]
 * @param {boolean} [opts.footDot]  Mark the foot with a dot.
 * @param {object} [opts.store]     threeObjStore, to register the normal glyph.
 * @returns {{group: object, guideLine: object|null, normalGlyph: object, normalTip: object}}
 */
export function buildDistanceIllustration(
  THREE,
  {
    blockId,
    foot,
    normal,
    guideTo,
    distanceLength,
    normalColor,
    accentColor,
    footDotColor,
    footDot = false,
    store = null,
  },
) {
  const group = new THREE.Group()
  const normalUnit =
    normal.lengthSq() > 1e-12 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0)
  const normalLength = normal.length()
  const accent = accentColor

  // A direction along the plane, toward whatever the guide points at. Used for
  // the right angle's arm and to shift the normal clear of the distance bar.
  const tangent = (guideTo ? guideTo.clone().sub(foot) : new THREE.Vector3()).clone()
  tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit))
  if (tangent.lengthSq() < 1e-10) {
    tangent.set(1, 0, 0)
    tangent.addScaledVector(normalUnit, -tangent.dot(normalUnit))
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 0, 1)
  }
  tangent.normalize()

  // n at its OWN magnitude through the shared glyph, so it follows the vector
  // style setting, takes a halo, and scales with zoom like any other vector. It
  // used to be a bespoke dashed ray of length max(2.2, d + 1.4) -- 4.4 units for
  // a unit normal at d = 3 -- labelled "n" while showing nothing of the sort.
  const normalGlyph = buildVectorShaftGlyph(
    THREE,
    `${blockId}_normal`,
    foot.clone(),
    normalUnit.clone(),
    normalLength > 1e-8 ? normalLength : 1,
    normalColor,
  )
  normalGlyph.userData.geoType = 'distance_normal_arrow'
  normalGlyph.userData.srcBlockId = blockId
  // The normal shares the distance bar's origin AND axis, so drawn true it sits
  // inside the bar. Shifting it along the tangent makes the two read as two
  // things. Its tail no longer sits exactly on the foot: this arrow shows a
  // direction, and a direction you cannot see shows nothing.
  normalGlyph.position.addScaledVector(tangent, NORMAL_SIDE_CLEARANCE)
  if (store) store[`${blockId}_normal`] = normalGlyph
  group.add(normalGlyph)

  const normalTip = foot
    .clone()
    .addScaledVector(normalUnit, normalLength > 1e-8 ? normalLength : 1)
    .addScaledVector(tangent, NORMAL_SIDE_CLEARANCE)

  let guideLine = null
  if (guideTo && guideTo.distanceToSquared(foot) > 1e-10) {
    guideLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([foot.clone(), guideTo.clone()]),
      new THREE.LineDashedMaterial({ color: accent, ...GUIDE_DASH }),
    )
    guideLine.computeLineDistances()
    guideLine.userData.geoType = 'geo_helper'
    guideLine.userData.srcBlockId = blockId
    group.add(guideLine)
  }

  const markerSize = Math.min(0.42, Math.max(0.18, Math.abs(distanceLength) * 0.16))
  const rightAngle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      foot.clone().addScaledVector(normalUnit, markerSize),
      foot.clone().addScaledVector(normalUnit, markerSize).addScaledVector(tangent, markerSize),
      foot.clone().addScaledVector(tangent, markerSize),
    ]),
    new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.9 }),
  )
  rightAngle.userData.geoType = 'geo_helper'
  rightAngle.userData.srcBlockId = blockId
  group.add(rightAngle)

  if (footDot) {
    const dot = createPointMarker({ color: footDotColor ?? accentColor, radius: 0.04 })
    dot.position.copy(foot)
    group.add(dot)
  }

  group.userData.geoType = 'distance_projection_illustration'
  group.userData.srcBlockId = blockId
  // The Q sweep redraws this each frame as Q moves.
  group.userData.guideLine = guideLine
  group.userData.tangent = tangent

  return { group, guideLine, normalGlyph, normalTip }
}

export default buildDistanceIllustration
