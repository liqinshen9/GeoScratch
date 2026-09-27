// A scene as ordinary GeoScratch blocks, so it is built by the editor's own
// generator and builders, and shown in a real (read-only) workspace.

export const blockIdFor = (scene, key) => `id-${scene.id}-${key}`
export const targetBlockId = (scene) => blockIdFor(scene, scene.targetKey)

const xyzFields = ([x, y, z]) =>
  `<field name="X">${x}</field><field name="Y">${y}</field><field name="Z">${z}</field>`

const vec3Block = (id, xyz) => `<block type="linalg_vec3" id="${id}">${xyzFields(xyz)}</block>`

const scalarBlock = (id, value) =>
  `<block type="scalar" id="${id}"><field name="scalar">${value}</field></block>`

function objectBlock(scene, object) {
  const id = blockIdFor(scene, object.key)
  switch (object.kind) {
    case 'point':
      return `<block type="linalg_point" id="${id}">${xyzFields(object.position)}</block>`
    case 'sphere':
      return `<block type="geo_sphere" id="${id}"><value name="RADIUS_INPUT">${scalarBlock(`${id}-radius`, object.radius)}</value><value name="CENTRE">${vec3Block(`${id}-centre`, object.position)}</value></block>`
    case 'cube':
      return `<block type="geo_cube" id="${id}"><value name="SIDE_LENGTH_INPUT">${scalarBlock(`${id}-size`, object.size)}</value><value name="CENTRE">${vec3Block(`${id}-centre`, object.position)}</value></block>`
    default:
      throw new Error(`[GeoScratch] Unknown identification object kind: ${object.kind}`)
  }
}

export function identificationToXml(scene) {
  const blocks = scene.objects.map((object) => objectBlock(scene, object)).join('')
  return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks}</xml>`
}
