# Object color system

`store/colorPresets.js`, `store/colorSystem.js`, `components/BlocksCanvas/blocks/blockColours.js`.
Centralized HCT-based coloring so a block and the 3D object it creates always
share a color, and every object of a type reads as one family.

## Model

Each preset defines, per object **type**, an HCT family: a fixed `hue` (the
family identity - what makes "all spheres" read as one group) plus a
`chromaRange` / `toneRange` that per-instance colors are drawn from (what makes
two spheres look distinct). `chromaRange: [0, 0]` pins a type to a neutral
gray/black family regardless of hue.

`colorSystem.js` maps a block id -> color deterministically via an FNV-1a string
hash (`hashString`), so a given block always gets the same color across reloads
with nothing extra persisted. `forInstance(type, blockId)` is the main entry;
`forInstanceVariant(type, blockId, toneDelta)` gives a tone-shifted variant of
the _same_ instance's color (two-band textures, a second marker on one object).
When no blockId is available (toolbox/flyout preview), a per-type stable
fallback seed is used.

`forRole(role)` is a **fixed** semantic-role color (operand A/B, result,
warning, accent, distance) for auto-generated teaching illustrations - not
varied per instance, so "Operand A" always means the same color.

`subscribeToPreset` fires only on `colorPreset` changes. `GeoScratchColors` is
also published as `window.GeoScratchColors` for builders.

## Preset hex comments

The `// ~#4570bb` comments next to each family are the color at that family's
**midpoint** chroma/tone - roughly a "typical" instance. Actual instances vary
across the full range, so a given block's real color won't match exactly.
Recompute with `Hct.from(hue, midChroma, midTone)` if you change a range.

The `monochrome` preset is capped at tone 58: the scene background and room
walls are already very light, so anything lighter washed out against them.

## blockColours.js

`BLOCK_STYLE_OBJECT_TYPES` maps a per-type block style to the color-system type
key, so the toolbox baseline color matches the family an instance would render
with. `BLOCK_TYPE_OBJECT_TYPES` maps `block.type` -> type key for the
live-recolor listener (which only has `block.type` to go on).
`BLOCK_TYPE_ROLES` does the same for non-renderable value primitives (Scalar,
Vector4): they have no object family, so they track the preset via the neutral
`accent` role instead of sitting at a fixed unthemed color.

The `WORKSPACE_VARIABLE` style (variable wrapper + references) is deliberately
outside the object color system - those blocks draw nothing in 3D and carry no
geometric type, so they get a neutral near-black rather than a color implying
kinship with an object family.
