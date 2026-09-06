# Transform pipelines and line rebuild (#77)

`utils/generateAndRun.js` (`rebuildTransformedLine`,
`runConnectedTransformPipelines`), `utils/lineTransformAnimation.js`,
`utils/rebuildTransformedLine.test.js`, `utils/stagedVectorReveal.js`.

## The #77 problem

A "Vector Equation of Line" bakes its wall-to-wall extent into geometry at build
time (`lineBoxInterval` in `geoVectorLine.js`). Applying a transform via
`applyMatrix4` just spins that baked segment, so after a rotation it no longer
spans the bounding box for its new direction - it falls short on one side and
pokes out the other.

`rebuildTransformedLine(object, worldMatrix)` fixes this by rebuilding the line
from the transformed origin/direction, re-running the extent calculation.
`worldMatrix` is world-space; lines are top-level so no parent-space correction
is needed. Returns the object to use going forward (rebuilt, or the original if
it couldn't rebuild - degenerate direction, missing origin).

It's exposed to generated runtime code as
`window.__geoScratchRebuildTransformedLine`, set in `generateAndRun.js` rather
than `sceneRuntime.js` because it's defined in `generateAndRun.js`, which
`sceneRuntime.js` must not import back (cycle).

## runConnectedTransformPipelines

Runs after the generated code, mutating object instances in place.

**For a line:** combine the steps into one world matrix (same order as the
block's matrix preview) and rebuild once. **Scale steps are skipped** - a line
has no size, so "scaling" it only shears its direction into a different line,
confusing as a size control. The pipeline block shows a warning when it skipped
one.

**For everything else:** bake a start/end pose pair + an `animate(progress)`
closure (see [animation.md](animation.md)).

A second pipeline feeding the same line/object keeps the first-captured start
and adds its own id to `animAliasBlockIds`.

## Line transform animation

`bakeLineTransformAnimation` - a line can't use the pose-lerp path (its extent
is baked into geometry, so interpolating pose carries the wrong extent through
every frame - the same #77 problem, once per frame). Rebuilding per frame is far
too expensive (a build makes canvas textures and every glyph style), so instead
the already-built group is driven with an explicit world matrix mapping its
baked segment onto the correctly re-clipped segment for the pose:

```
x = O1 + s*u1   ->   Op + (k*s + c)*up
```

a rotation `u1 -> up`, a stretch of `k` **along** `u1` (so the tube
cross-section, and apparent thickness at every zoom, is untouched), and a slide
of `c` along the line. `k` and `c` come from re-running the same box clip the
build used, so both ends sit exactly on the box every frame. The map is affine
in `s`, so the midpoint (and its label) lands on the new midpoint. At progress 1
the matrix is the identity - pixel-identical to the static scene.

`startOrigin`/`startDirection` describe progress 0 (untransformed); `line` is
the rebuilt progress-1 line. Assumes the line is top-level (its `<primitive>`
wrapper is identity), same assumption `rebuildTransformedLine` and the pose path
make. Replaces the line's own t-sweep closure when both apply - the marker
instead rides along at its fixed t.

## Gotchas a refactor would reintroduce

### missed-box-carry-rigidly

A pose whose line misses the box entirely has no interval to clip to - carry the
segment rigidly (`k = 1`) for that frame rather than collapsing it. Only
reachable off-screen, since both ends of the animation cross the box.

### marker-not-part-of-extent

The t-marker is a point on the line at a fixed t, not part of its baked extent,
so it neither slides with `c` nor stretches with `k`. It's pinned to
"interpolated origin + t * interpolated direction" with the group's matrix
undone so the sphere stays round. Its zoom-invariant scale is whatever
`ZoomInvariantScaler` last wrote - **read** here, not overwritten, since with
`matrixAutoUpdate` off the marker's own write is inert.

### keep-the-jitter

The build offsets the whole group by a sub-visual perpendicular jitter to break
z-fighting (see
[vector-line-glyphs.md](vector-line-glyphs.md#z-fight-jitter)). `rest()` and the
marker's world position must keep that offset, or the line/marker shifts by that
much at rest.

### hand-back-to-matrixautoupdate

`rest()` hands the group (and marker) back to the normal `matrixAutoUpdate`
path, so nothing about a merely-selected line differs from an unselected one -
`ZoomInvariantScaler` writes the marker's scale every frame and needs its matrix
derived from it again.

### rotation-past-180

The pose-lerp path (in `generateAndRun.js`) eases the whole 0..1 with a
shortest-path quaternion slerp. A single rotation step past 180 degrees animates
the short way round - the pose decompose already collapsed it to a <=180
quaternion. This is a known limitation, not a bug to "fix".
