# Object color system

`store/colorPresets.js`, `store/colorSystem.js`, `components/BlocksCanvas/blocks/blockColours.js`.
Centralized HCT-based coloring so a block and the 3D object it creates always
share a color, and every object of a type reads as one family.

## Model

Each preset defines, per object **type**, an HCT family: a fixed `hue` (the
family identity - what makes "all spheres" read as one group) plus a
`chromaRange` / `toneRange`. By default every instance takes the midpoint of
both ranges, so all spheres share one color; with instance variation on, each
instance is drawn from the ranges instead (see below). `chromaRange: [0, 0]`
pins a type to a neutral gray/black family regardless of hue.

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

`subscribeToPreset` fires on a change to `colorPreset` **or** `resolvedTheme`
(the light/dark presets differ). `GeoScratchColors` is also published as
`window.GeoScratchColors` for builders.

## Per-instance variation

`settings.colorInstanceVariation`, default **off**. Off, `instanceHct` returns
the family midpoint for every block id. On, the hash picks tone and chroma
within the ranges, so two objects of one type look distinct.

It is off because the tone spread is a lightness difference (up to 20 tone
units), and lightness and contrast are depth cues in their own
right: the brighter, higher-contrast object tends to look nearer (O'Shea,
Blackburn & Ono 1994; Dosher, Sperling & Wurst 1986). A random one per object
is noise in any depth judgment, and it competes with shading for the lightness
channel. The study does not assess it, so `STUDY_PINNED_SETTINGS`
(`study/phase1/conditions.js`) holds it off in Phase 1 and the holistic tasks
regardless of the device's settings.

Hue is unaffected either way: type identity never depended on it.

## Dark mode

Each preset has an optional `dark` sub-object (`{ types, roles }`) with the same
family hues but tone ranges lifted so instances read on the dark scene ground.
`activePreset()` returns `{ label, ...preset.dark }` when the store's
`resolvedTheme` is `dark`, so `forInstance` / `forRole` need no changes at the
call site. See `docs/architecture/theming.md`.

## How the type hues are chosen

Vivid and High Contrast are not hand-picked. `optimizeHues`
(`utils/categoricalPalette.js`) chooses six hues, one per chromatic type, that
maximise the smallest pairwise CIEDE2000 difference in the palette, with the
neutral line colour included as a fixed member. That criterion is Colorgorical's
perceptual distance score (Gramazio, Laidlaw & Schloss 2017); CIEDE2000 is the
CIE's current colour-difference formula (Sharma, Wu & Dalal 2005 give the
implementation and the test pairs `categoricalPalette.test.js` checks).
Differences are measured at both themes' tones, and ties on the worst pair are
broken by the next-worst, which keeps the max-min search off its plateaus. The
search is deterministic: evenly spaced starts, then coordinate ascent in whole
degrees.

The constraints, and why:

- **One tone for every type** (`PALETTE_TONES`: 50 light, 56 dark). Lightness
  and contrast are depth cues, so a type that rendered lighter would read as
  nearer (see [Per-instance variation](#per-instance-variation)). Separation
  comes from hue and chroma alone. The tones sit well clear of the white light
  room and the tone-16 dark room.
- **One chroma per preset** (Vivid 50, High Contrast 85). HCT clamps to the
  sRGB gamut, so some High Contrast hues render lower than 85; the optimiser
  measures the colours as actually rendered.
- **Lines stay neutral grey**, as they always were.
- **Typical colour vision only.** Study participants with atypical colour vision
  are excluded, so the optimiser does not trade typical-vision separation for
  colour-blind separation. Equal lightness leaves dichromats little to go on; do
  not describe either preset as colour-blind safe.

`assignHues` then hands the hues to types by smallest total hue shift: Vivid
against the old hand-picked hues, so types kept roughly their colours; High
Contrast against Vivid, so a type keeps its colour family across presets
(study conditions T1 and T9 differ only in saturation).

Result: the closest pair of types is about 23 CIEDE2000 units apart in Vivid
(12 before) and about 25 in High Contrast (13 before). `colorPresets.test.js`
re-runs the optimiser and fails if the committed hues drift from it, so
changing a tone or chroma means updating the hues it reports.

## Monochrome

Every type renders as the same neutral grey at `PALETTE_TONES` (50 light, 56
dark): Vivid with hue and chroma removed and lightness unchanged. Types are told
apart by shape alone.

It used to give each type its own grey, from near-black lines to mid-grey cubes.
That separated types by lightness, which is a depth cue, so switching to it
changed two things at once: hue went away and lightness differences arrived.
With one grey, Monochrome differs from Vivid in hue and chroma only, and
Monochrome / Vivid / High Contrast step chroma 0 / 50 / 85 at constant
lightness. Study conditions T8, T1 and T9 are exactly that series.

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

## Cube edges

The optional cube outline (`settings.cubeShowEdges`) is
`forInstanceVariant('cube', blockId, ±28)`: darker than the faces on the light
scene, lighter on the dark one. A fixed faint white (the old default) vanished
wherever an edge had the light background behind it, so which edges showed
depended on the camera angle. It re-tints with the cube on a preset/theme change.

## Per-type color overrides

Settings > Colors has a fixed-color picker per type (point, vector, line,
sphere, cube, teapot), stored as `pointColor`, `cubeColor`, ... (`null` = Auto).
The keys live in `OBJECT_COLOR_SETTING_KEYS` (`colorPresets.js`). `forInstance`
returns the override as-is for every instance of that type, and
`forInstanceVariant` tone-shifts it, so derived colors (cube edges, a line's
light/dark bands) still work. `subscribeToPreset` also fires on an override
change. Phase 1 conditions spread `DEFAULT_SETTINGS`, so the overrides are
pinned to Auto in every trial.
