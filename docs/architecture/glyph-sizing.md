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

### view-height

Distance alone keeps a glyph the same size relative to the **view**, so its
pixel width tracked the canvas height: a plain tube was about 1.8px in an
820px-tall editor view and 1.4px in the study's fixed 640px stage, and thinner
still next to a tall editor on a big monitor. `ZoomInvariantScaler` and
`DashZoomSync` now also multiply by `viewHeightFactor(size.height)`
(`VIEW_HEIGHT_REFERENCE / height`, in `utils/zoomInvariantScale.js`), so glyphs
are a fixed number of CSS pixels, calibrated to how they looked at 820px.
Points and arrowheads therefore look as they did in the editor, and grow in a
shorter canvas.

On top of that, shafts (tagged, non-uniform, not an arrowhead) take a
cross-section factor from `tubeWidthScale`, which draws a line tube and a
vector shaft `TUBE_WIDTH_PX` (2.6) wide: the same as the plain-line stroke. So
the line style changes the shading and not the width. Without it the study's
T1 (tubes) and T2 (plain lines) differed in thickness as well as shading, by
3 against 5 device pixels, which confounded exactly the comparison T2 exists
for. `LINE_TUBE_RADIUS` / `VECTOR_TUBE_RADIUS` in `sceneConstants.js` mirror
the builders' radii, which cannot import them; change them together.

Only the pixel width changed, not placement, so the Phase 1 stimulus seed did
not need a bump. Images rendered from the scene (survey cue images, pivot
diagrams) show the old widths until they are re-rendered.

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

A cross-section-scaled child normally keeps a length scale of 1. The one
exception is an arrowhead, tagged `zoomInvariantMaxAspectScale`: past that
cross-section scale it also scales lengthwise, holding its cone angle at 60
degrees instead of flattening into a disc. See
[vector-line-glyphs.md](vector-line-glyphs.md)#arrowhead-cone-angle-floor.

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

## Point markers

Every point marker in the app - a standalone Point, a plane's defining point, a
sphere's centre, an operator's foot dot, the dot a degenerate vector collapses
to - comes from `createPointMarker` in `utils/pointMarker.js`, published to
builders as `window.geoPointMarker`. It owns the sphere geometry, the
matte/sheen finish, and the `zoomInvariantRadius` + `zoomInvariantUniform`
tagging that this file's scaler keys off. Radius stays a per-call argument,
because a standalone Point and a foot dot are deliberately different sizes; the
finish and the tagging do not.

Settings > Geometry > "Matte Points" swaps the finish. Nothing re-runs the
generated code when a setting changes, so the finish is repainted in place: the
module keeps a registry of the materials built this run and one subscription
repaints all of them. The registry is cleared per run by
`resetPointMarkerRegistry()` from `installSceneRuntime`, alongside the other
per-run registries. A per-marker self-unsubscribing closure (the pattern used
for object-level settings elsewhere) does not work here, because most markers
are nested parts with no `threeObjStore` key of their own to anchor the
unsubscribe to.

## Gotchas a refactor would reintroduce

### one-distance-per-object

`ZoomInvariantScaler` computes one distance per **top-level object**, not one
per zoom-invariant child. A multi-piece glyph (a dashed/ringed line's many tube
or ring segments) must scale as a single uniform unit. Letting each piece
compute its own correction from its own world position made segments at
different camera distances end up visibly different sizes - a bulging/tapering
artifact on any line long enough (or viewed end-on enough) that its pieces sit
at meaningfully different distances. Lines expose `userData.segmentMid` (their
local-space centre) as the single reference point, and vectors
`userData.sizingAnchor` (their shaft's midpoint), read from the top-level
object or, for a vector wrapped with its tail marker, its direct child. A
vector's group sits at the world origin with its geometry in world space, so
before `sizingAnchor` (2026-10-01) every vector was sized for the origin's
distance rather than its own: off by up to about 30% for a vector near the edge
of the room. Everything else uses its own world position.

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
