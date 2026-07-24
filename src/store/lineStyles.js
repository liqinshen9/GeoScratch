export const LINE_STYLES = Object.freeze({
  PLAIN_LINE: 'plain_line',
  ILLUMINATED_LINE: 'illuminated_line',
  PLAIN_TUBE: 'plain_tube',
  RINGED_TUBE: 'ringed_tube',
});

// How a plain_tube line indicates the stretch(es) where it passes through a
// solid object. Only applies when lineStyle is PLAIN_TUBE (ringed_tube
// already looks ringed everywhere, and plain/illuminated lines have no tube
// surface to accent).
export const LINE_COLLISION_STYLES = Object.freeze({
  RINGED: 'ringed',
  DASHED: 'dashed',
  DARK_TEXTURE: 'dark_texture',
});
