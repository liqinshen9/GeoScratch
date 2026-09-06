import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

/**
 * The three.js namespace plus the addon classes GeoScratch relies on, bundled
 * into one object.
 *
 * This exists because generated block code sees THREE as a single value (it is
 * published as `window.THREE` by sceneRuntime.js, and passed as an argument to
 * the generated function), so an addon that is a separate module import here has
 * to be folded into that one object to be reachable from a block builder. Both
 * the runtime and Scene3D must use the SAME composition, or a glyph type that
 * works in one will be undefined in the other.
 */
const THREE = {
  ...THREEBase,
  TeapotGeometry,
  Line2,
  LineGeometry,
  LineMaterial,
  LineSegments2,
  LineSegmentsGeometry,
}

export default THREE
