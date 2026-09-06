# Glyph sizing and zoom-invariant scale

`components/Scene3D/sizing/GlyphSizing.jsx`, `components/Scene3D/sceneConstants.js`,
`utils/zoomInvariantScale.js`. Keeps point/line/vector glyphs a readable size on
screen regardless of camera distance, plus the "extra thick / extra large"
settings.

## Zoom-invariant scale

A mesh tagged `userData.zoomInvariantRadius` renders at its authored radius at
`ZOOM_INVARIANT_REFERENCE_DISTANCE` (the default camera distance) and scales
linearly with camera distance from there, clamped to
`ZOOM_INVARIANT_MIN_SCALE` (0.3) .. `ZOOM_INVARIANT_MAX_SCALE` (5).

`ZOOM_INVARIANT_REFERENCE_DISTANCE` lives in its own module because the halo
discard shader also needs it: a tube's real world-space radius grows at this
same rate when zoomed out, so a fixed world-unit "same touching point"
tolerance only holds near this distance.

## GlyphSizing.jsx components

### ZoomInvariantScaler

Per frame, for each top-level object: compute **one** `zoomScale` from camera
distance, then walk visible children and set `child.scale`.

`finalScale = zoomScale * thickMultiplier`, where the multiplier is chosen by
how the child is tagged (this is the whole rule):

| Child tag                                             | Setting toggle      | Scale mode                          |
| ----------------------------------------------------- | ------------------- | ----------------------------------- |
| `thickenGroup === 'vector'` (shaft or arrowhead cone) | `extraThickVectors` | cross-section: `scale.set(f, 1, f)` |
| `zoomInvariantUniform` (point marker)                 | `extraLargePoints`  | uniform: `scale.setScalar(f)`       |
| else (line / tube glyph)                              | `extraThick`        | cross-section: `scale.set(f, 1, f)` |

The multiplier applies whether or not zoom-invariant sizing is on (when off,
`zoomScale` is 1). A vector is identified by its **tag**, not its scale mode, so
its shaft keys off `extraThickVectors` even though it scales cross-section-only
like a line - that keeps the two "extra thick" settings independent.

Per-kind maximums (`VECTOR_ZOOM_MAX_SCALE`, `POINT_ZOOM_MAX_SCALE`,
`EXTRA_LARGE_POINT_MAX_SCALE`) cap glyphs that otherwise balloon or read as
blobs when zoomed out; lines/tubes use the full `ZOOM_INVARIANT_MAX_SCALE`.
Non-uniform glyphs also get a floor of `MIN_LINE_WORLD_RADIUS / baseRadius`.

### DashZoomSync

Keeps each `geo_vector_line`'s dash/ring collision-accent pattern
(`userData.updateZoomRatio`) in sync with camera distance -
`geoVectorLineDefinition` builds the glyph once with no camera access. Passes
the **raw unclamped** distance ratio, not a pre-clamped scale, so dashes and
rings can each apply their own clamp range in `geoVectorLine.js` instead of the
tuning being split across two files.

### FatLineSync

Syncs `Line2` / `LineMaterial` glyphs with canvas resolution (for correct pixel
linewidth) and the extra-thick multiplier - neither is available at
construction time. A `thickenGroup === 'vector'` child keys off
`extraThickVectors`, same independence rule as above.

## Gotchas a refactor would reintroduce

### one-distance-per-object

`ZoomInvariantScaler` computes one distance per **top-level object**, not one
per zoom-invariant child. A multi-piece glyph (a dashed/ringed line's many tube
or ring segments) must scale as a single uniform unit. Letting each piece
compute its own correction from its own world position made segments at
different camera distances end up visibly different sizes - a bulging/tapering
artifact on any line long enough (or viewed end-on enough) that its pieces sit
at meaningfully different distances. Lines expose `userData.segmentMid` (their
local-space centre) as the single reference point; everything else uses its own
world position.

### dash-sync-priority

`DashZoomSync` has explicit `useFrame` priority `-1` so it runs **before**
`ZoomInvariantScaler` every frame, not just by mount-order coincidence.
Rebuilding the dash pattern creates new Mesh children with an unset `(1,1,1)`
scale, and `ZoomInvariantScaler` is what corrects that to the right
cross-section radius. If it ran first, those new segments would render at their
raw radius for one frame every time the pattern rebuilds - a visible thickness
flicker during a continuous zoom, since rebuilds happen repeatedly as the scale
crosses each threshold.

### axis-vs-line-radius

`AXIS_SHAFT_RADIUS` (0.022) is the axes' fixed world radius (axes are not
zoom-invariant-scaled). Every line glyph's base radius is bigger, but the
`MIN_SCALE` clamp can shrink a line below that at close zoom.
`MIN_LINE_WORLD_RADIUS` (`AXIS_SHAFT_RADIUS * 1.25`), applied as a floor after
the zoom-invariant scale, keeps a line visually thicker than the axis at _any_
zoom, not just at the reference distance. This is the fix for #86 (a regression
of #43).
