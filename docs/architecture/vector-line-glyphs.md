# Vector-line glyphs

`components/BlocksCanvas/blocks/geometric/geoVectorLine.js` (the
`geoVectorLineDefinition` builder), plus `utils/vectorShaftGlyph.js` and
`utils/blockGeometry.js`.

`geoVectorLineDefinition` is both `.toString()`-serialised into generated code
by the block generator **and** exported for `generateAndRun.js` to call directly
when rebuilding a transformed line. Its body only touches `window.*` and its
params, so both call styles work. Because it's serialised, it **cannot import a
shared helper** - anything two call sites must agree on is exposed on
`group.userData` (e.g. `boxInterval`).

## Line-vs-box clipping

The infinite line is clipped to the 3D view's bounding box (a 40-unit cube,
half-extent 20) with a proper line-vs-AABB slab test (`lineBoxInterval`). It
returns the `[tEnter, tExit]` interval where the line is inside the box and
works whether the origin is inside (common) or outside it - e.g. after a
translate transform pushes the origin past a wall (#77). Both interval ends can
be negative. A flat offset from the origin only reaches a wall when the line
passes through the world origin and is axis-aligned, which is why the real slab
test is needed.

The tube's local frame is centred on the **segment midpoint**, not the vector
equation's origin - the two only coincide when the line extends equally in both
directions. `group.userData.segmentMid` / `segmentHalfLength` expose this for
`tubeCollision.js`.

## Segment and dash machinery

`DASHED_SEGMENT_LENGTH` / `DASHED_GAP_LENGTH` are shared by every style so
"dashed" looks the same everywhere. `computeSegmentPairs(zones, dashed, ...)`
returns the y-ranges to draw, each tagged `isDash` (a short bump inside a
collision zone) or not (a long solid stretch). The two get different
zoom-invariant treatment: bumps grow in every dimension as the camera pulls back
(so they don't collapse to sub-pixel); solid stretches grow only in
cross-section (or neighbouring stretches visibly gap apart) - see
`addTubeSegment`'s `uniform` param and `zoomInvariantUniform` in
[glyph-sizing.md](glyph-sizing.md).

`THICK_DASHED_SEGMENT_LENGTH` / `_GAP_LENGTH` are tuned bigger ("fewer, larger
dashes" reads better on a solid tube), shared by `plain_tube` and
`plain_line`-thick. These are deliberately **not** per-segment
zoom-invariant-scaled: a dash is a literal piece of the glyph's own length, so
it should foreshorten with normal perspective like the glyph. Instead
`DashZoomSync` scales the dash _length_ by camera distance, which is what makes
the dash **count** respond to zoom (see `dash-length-vs-count` below).

## Halo companions

Per-style inflated companion meshes for the halo depth-trick (full mechanism in
[halos.md](halos.md)). `buildHaloCompanion(baseRadius)` makes one sized
`baseRadius + 0.01`, on `HALO_LAYER`, tagged with the same
`zoomInvariantRadius` as the real glyph so `ZoomInvariantScaler` inflates it in
lockstep. One `haloId` per line (stable per blockId). `haloImmuneIds` is a
shared array mutated in place by `registerHaloLine`.

The Settings > Halos toggle gates whether a **new** line gets the companion /
discard wiring at all; toggling it back on doesn't retroactively wire
already-built lines (needs a regeneration). `HaloUniformSync`'s `haloEnabled`
uniform is what makes on/off instant for lines that do have the wiring.

## The three technique styles

Picked by `settings.lineStyle`. All built up front; `applyGlyphVisibility`
toggles `.visible`.

### plain_line

Three's "fat lines" (`LineSegments2` / `LineMaterial`, `worldUnits: false`), not
a cylinder. WebGL clamps `LineBasicMaterial` linewidth to 1px on most platforms,
so a real mesh is the only way to make it visibly thick. A cylinder's two ends
foreshorten independently at different camera distances; a fat line is stroked
to a constant screen-space band like a real GL line. Resolution + the extra-thick
multiplier come from `FatLineSync` (no canvas access in the builder).

### plain_tube

`CylinderGeometry(0.051, ...)` + `MeshStandardMaterial` (picks up scene lights
like every other solid). `dashedTubeGroup` is a separate hidden replacement for
the dashed collision style - real gaps, not an overlay.

### ringed_tube

`CylinderGeometry(0.085, ...)` textured with a repeating 2-band `CanvasTexture`
(`makeRingTexture`). Band frequency is fixed at build time
(`RINGED_TUBE_RING_PERIOD`), deliberately not zoom-responsive, so there's no
per-frame texture rebuild racing the cross-section's zoom-invariant scaling.
`ringedTubeDashedGroup` is the dashed-style replacement (per-segment cloned
textures).

## Collision accents

How a line marks where it enters a solid (`settings.lineCollisionStyle`). Two of
the three looks - `ringed` (pink bands) and `dark_texture` (dark band) - are
pure overlay geometry in shared groups (`collisionAccentRinged`,
`collisionAccentDarkTexture`) anchored to the same local frame, with no
dependency on the active glyph having a real radius, so one pair of groups
serves every line style. The third, `dashed`, punches literal gaps in whichever
glyph is visible, so it's handled per-glyph (`dashedTubeGroup` /
`ringedTubeDashedGroup` / `setThickLineSegmentPairs`).

`getAccentRadius(style)` sizes the overlay to the visible glyph's own radius
(0.085 / 0.051 / 0.035-nominal for fat-line) plus a clearance "hair".

## userData contract

`geoType`, `origin`, `direction` (with a `named_vector_expression` tag),
`labelAnchors` / `labels`, `segmentMid` / `segmentHalfLength` / `srcBlockId`
(for `tubeCollision.js`), `boxInterval` / `boxExtent` / `tMarker` (for
`generateAndRun.js`'s line animation), `t` / `rPoint`, `animate(p, ease)`
(issue #38 t-sweep: progress 1 = resting, progress 0 sweeps the marker to the
origin), and the hooks `updateZoomRatio`, `setCollisionZones`, `refreshGlyph`.

## Gotchas a refactor would reintroduce

### z-fight-jitter

Two lines with the same origin/direction produce numerically coincident
geometry, which GPU depth testing resolves inconsistently frame-to-frame
(z-fighting flicker). The whole line is nudged by a tiny **deterministic
per-block** offset perpendicular to its own direction (`Z_FIGHT_JITTER`,
0.0015), well under the tube radius, enough to break exact coincidence.

### default-direction

An unconfigured line defaults to direction `(1, 1, 1)`, **not** axis-aligned. An
axis-aligned default sits exactly on top of that axis and is visually
indistinguishable from it (the tick-mark collars poke through).

### dispose-on-rebuild

Every "replacement" glyph (`dashedTubeGroup`, `ringedTubeDashedGroup`, accents)
rebuilds by clearing a group's children and adding fresh ones each time the zoom
scale crosses a threshold or the collision zones change - during a fast zoom
that's many times a second. `.remove()` detaches a child but does **not** free
GPU geometry/material/texture resources, so `clearGroupChildren` must call
`.dispose()`. A fast zoom without it leaks enough GPU memory to exhaust
resources mid-session, surfacing as corrupted / torn textures that don't
self-heal. `disposeMaterial` is false where the segment shares a persistent
material (only the geometry is new), true where the material/texture is created
per segment.

### needle-triangle

`CylinderGeometry` has only one height segment unless told otherwise - its side
is two triangles spanning the tube's entire length (~40 units) against a 0.085
radius, an aspect ratio over 1000:1. Perspective-correct texture-coordinate
interpolation across a triangle that extreme loses precision on some GPU/driver
combinations, worse from an oblique angle - which is exactly what breaks the
ring texture and what doesn't (fine looking straight down the tube). The fix is
`RINGED_TUBE_HEIGHT_SEGMENTS` (roughly one per ring) to keep every triangle
short - **not** the ring size or count. The collision-accent ring never hits
this because its cylinders are only ever one collision zone long.

### ringed-tube-opaque

The `ringed_tube` base material is deliberately **not** `transparent: true`
(only the collision-accent ring is). An early attempt at the needle-triangle bug
set `transparent: true` here; that moves the tube into the transparent render
queue, which sorts whole objects by distance instead of per-pixel depth,
breaking occlusion against any other transparent object (e.g. a see-through
cube) it crosses. Staying opaque keeps it in the normal depth-tested pass.

### ring-texture-filtering

Hard-edged 2-colour stripes are worst-case for texture filtering.
`makeRingTexture` uses `NearestFilter` magFilter (keeps close-up edges crisp
instead of a bilinear-blurred gradient) and `anisotropy = 16` (fixes
grazing-angle minification aliasing / the "flickering torn edge" on a tube
running away from the camera). `clone()` copies both fields, so every per-segment
texture clone inherits them.

### discard-shader-asymmetry

`dashedTubeMat` (and each per-segment ringed-dash material) is a **separate**
material from the base `cylMat` / `ringedTubeMat`. When a line is itself the
dashed replacement (its own crossing gap, or a collision zone), the dashed
material is what's visible - so it must also be wired through
`applyHaloDiscardMaterial`. Without that, a colliding line's own gap silently
stops working (its real surface never discards) even though other lines still
gap correctly around it - the inflated companion is unaffected by collision
state. This was a reported asymmetric bug.

### one-companion-visible

Only the active style's halo companion is ever `.visible` on `HALO_LAYER` at
once (`applyGlyphVisibility`). Three differently-sized footprints for the same
line would fight each other in the depth prepass.

### accent-clearance

The accent overlay's clearance past the base radius (`getAccentRadius + 0.006`)
must be big enough to actually separate the two surfaces in the depth buffer.
`0.001` (the original) still z-fought at ordinary camera distances - a faint
flicker for the semi-transparent ring, and for the opaque `dark_texture` overlay
the base tube's own ring texture kept showing through instead of being hidden.

### dash-length-vs-count

`DashZoomSync` scales the dash/gap **length** (not just cross-section radius) by
camera distance. That's what makes the dash _count_ respond to zoom: fewer,
bigger dashes fit across a fixed-width collision zone as the camera pulls back,
more (still legible) ones as it moves in. A flat apparent-size-constant scale
would only change how big each fixed-count dash looks. Ring band frequency is
_not_ scaled this way - it's fixed, so no ring rebuild lands mid-frame during a
fast zoom.

## Vector shaft glyph

`utils/vectorShaftGlyph.js`. `buildVectorShaftGlyph` builds a vector's shaft in
all three styles (toggled by `settings.vectorStyle`) plus each style's
arrowhead cone, and live-reacts to settings changes. **Not shared** with
`geoVectorLine.js`: a vector shaft is one finite known segment - no collision
zones, no halo, no dash-zoom-sync - so it's far simpler than that file's
machinery. The ring-texture helper is duplicated here rather than shared for the
same reason.

Every size constant is an eyeballed per-style number with no formula linking
them - edit a number to change how a style looks. `color` omitted resolves to
this instance's color via `colorSystem.js`, with `blockId` doubling as the color
seed (a suffixed id like `<id>_u` for an operand glyph still gets a stable
distinct color). `setVectorLength(newLength)` rescales in place (e.g. Vector
Transform's scale step) - kept as a `userData` method so a rescale needn't
re-wire the settings subscription or replace the group in `threeObjStore`.

### shaft-stops-short

Each style's shaft ends exactly its own cone's length short of the true tip
(`origin + direction*length`, where the label is anchored). The cone length is
fixed - never zoom-scaled, only its radius responds to zoom / Extra Thick
Vectors - so the tip always lands exactly on the true tip.

### cone-anchored-at-base

Arrowhead cones are anchored at their **base** (geometry translated so the base,
not the centre, is the local origin). A sphere scaled from its own centre never
moves, so a point marker's label tracks perfectly; a cone scaled from its base
does move - anchoring at the base is what keeps the tip fixed. Getting this
wrong broke tip/label alignment before.
