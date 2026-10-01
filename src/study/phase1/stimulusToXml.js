// A stimulus as ordinary GeoScratch blocks, so a trial is built by the same
// generator, runtime and builders as the editor's 3D view.
// See docs/architecture/study-phase1.md#scene-build.

const BLOCK_TYPES = {
  line: 'geo_vector',
  vector: 'linalg_vec3',
  point: 'linalg_point',
  cube: 'geo_cube',
  sphere: 'geo_sphere',
}

/**
 * The salt only affects colour with per-instance variation on, which the study
 * pins off. See docs/architecture/color-system.md#per-instance-variation.
 */
export function blockIdFor(stimulus, key) {
  return `p1-${stimulus.id}-${stimulus.colourSalt}-${key}`
}

/** The labelled objects: targets A and B, and a distance question's reference C. */
export function targetBlockIds(stimulus) {
  const ids = { A: blockIdFor(stimulus, 'A'), B: blockIdFor(stimulus, 'B') }
  if (stimulus.objects?.some((o) => o.role === 'reference')) ids.C = blockIdFor(stimulus, 'C')
  return ids
}

const escapeXml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const xyzFields = ([x, y, z]) =>
  `<field name="X">${x}</field><field name="Y">${y}</field><field name="Z">${z}</field>`

const vec3Block = (id, xyz) => `<block type="linalg_vec3" id="${id}">${xyzFields(xyz)}</block>`

const scalarBlock = (id, value) =>
  `<block type="scalar" id="${id}"><field name="scalar">${value}</field></block>`

// A target's letter rides in the naming registry's own block.data record, so
// the label layer shows "A"/"B" exactly as it would show a user-chosen name.
function namingData(object, id) {
  if (object.role !== 'target' && object.role !== 'reference') return ''
  const record = {
    geoScratchNaming: { kind: object.kind, number: null, custom: object.key, refId: `ref-${id}` },
  }
  return `<data>${escapeXml(JSON.stringify(record))}</data>`
}

function objectBlock(stimulus, object, index) {
  const id = blockIdFor(stimulus, object.key)
  const type = BLOCK_TYPES[object.kind]
  const position = `x="${40 + index * 20}" y="${40 + index * 20}"`
  const data = namingData(object, id)

  switch (object.kind) {
    case 'line':
      return `<block type="${type}" id="${id}" ${position}>${data}<value name="POS">${vec3Block(`${id}-pos`, object.origin)}</value><value name="DIR">${vec3Block(`${id}-dir`, object.direction)}</value></block>`
    case 'vector':
      // A vector with its tail plugged into ORIGIN: the glyph runs tail -> tip
      // and its label hangs at the tip. See naming-registry.md for the <data>.
      return `<block type="${type}" id="${id}" ${position}>${data}${xyzFields(object.vector)}<value name="ORIGIN">${vec3Block(`${id}-origin`, object.origin)}</value></block>`
    case 'point':
      return `<block type="${type}" id="${id}" ${position}>${data}${xyzFields(object.position)}</block>`
    case 'cube':
      return `<block type="${type}" id="${id}" ${position}>${data}<value name="SIDE_LENGTH_INPUT">${scalarBlock(`${id}-size`, object.size)}</value><value name="CENTRE">${vec3Block(`${id}-centre`, object.centre)}</value></block>`
    case 'sphere':
      return `<block type="${type}" id="${id}" ${position}>${data}<value name="RADIUS_INPUT">${scalarBlock(`${id}-radius`, object.radius)}</value><value name="CENTRE">${vec3Block(`${id}-centre`, object.centre)}</value></block>`
    default:
      throw new Error(`[GeoScratch] Unknown stimulus object kind: ${object.kind}`)
  }
}

export function stimulusToXml(stimulus) {
  const blocks = stimulus.objects.map((object, i) => objectBlock(stimulus, object, i)).join('')
  return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks}</xml>`
}
