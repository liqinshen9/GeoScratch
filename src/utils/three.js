import * as THREEBase from 'three'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

/**
 * three.js + the addon classes GeoScratch uses, bundled into one object -
 * generated block code sees THREE as a single value. Runtime and Scene3D must
 * use this SAME composition. See docs/architecture/generated-code-runtime.md.
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
