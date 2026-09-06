export const LINE_STYLES = Object.freeze({
  PLAIN_LINE: 'plain_line',
  PLAIN_TUBE: 'plain_tube',
  RINGED_TUBE: 'ringed_tube',
})

// How a line indicates the stretch(es) where it passes through a solid
// object -- applies regardless of which lineStyle is active (see the
// COLLISION ACCENTS section of geoVectorLine.js for how each style
// represents each of these three looks).
export const LINE_COLLISION_STYLES = Object.freeze({
  RINGED: 'ringed',
  DASHED: 'dashed',
  DARK_TEXTURE: 'dark_texture',
})
