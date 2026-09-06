# Animation playback (#38)

`components/Scene3D/AnimationDriver.jsx`, plus the `animate` closures baked in
`utils/generateAndRun.js` and `utils/lineTransformAnimation.js`
([transform-and-line-rebuild.md](transform-and-line-rebuild.md)) and
`utils/stagedVectorReveal.js`.

## The opt-in protocol

An object opts into animation by exposing `userData.animate(progress, ease)` - a
closure baked at scene-build time that renders progress 0..1 of whatever that
object's blocks describe (a transform pipeline interpolating pose, a
vector-arithmetic group revealing its arrows in sequence, a line t-sweep, ...).

It gets the **raw linear progress** plus the configured easing function and
applies the ease where it makes sense: a single motion eases the whole 0..1, a
staged reveal eases each stage's own local progress.

`progress 1` is always the **resting state** = today's static scene.

## AnimationDriver

Headless, mounted under `<Scene>` alongside `<SelectionHighlight>`, same
pattern: resolve the selected block's 3D object, mutate it each frame, call
`invalidate()` (`frameloop="demand"`).

- Resolves the target by **stable `srcBlockId`** (or `animAliasBlockIds`), so a
  scrub position survives edits - a scene rebuild re-bakes the closure and this
  re-resolves.
- `animAliasBlockIds` lets a helper block that renders no object of its own
  (e.g. a `transform_pipeline`) stand in as the selection that drives another
  object.
- On selection change / unmount, snaps the previously-animated object back to
  progress 1.
- Places the target at the scrub position on selection, manual scrub, and after
  a rebuild; the play loop drives it directly while playing.

## Pose-pair baking

For non-line objects, `runConnectedTransformPipelines` bakes
`userData.transformAnim` = `{startPos/Quat/Scale, endPos/Quat/Scale,
pipelineBlockIds}` and an `animate` that lerps position/scale linearly and slerps
rotation shortest-path. Assumes the object is top-level (its `<primitive>`
wrapper is identity). See
[transform-and-line-rebuild.md](transform-and-line-rebuild.md#rotation-past-180)
for the >180-degree rotation limitation.

## Staged vector reveal

`utils/stagedVectorReveal.js`. `makeStagedVectorReveal(parts)` builds an
`animate` closure that reveals a sequence of vector-shaft glyphs one after
another: each grows from its own baked origin over an equal slice of the
timeline, and the easing is applied to **each stage's own local progress** so
every arrow eases over its slot rather than inheriting one curve stretched
across the whole sequence. Used by `vector_arithmetic` and
`vector_cross_product` (operand arrows + a result arrow). Each part grows via
`buildVectorShaftGlyph`'s `setVectorLength` (fixed origin/direction, no
re-anchoring); a degenerate result (a plain sphere, `full` 0) has no
`setVectorLength` and is just left visible.

## Gotcha a refactor would reintroduce

### cap-the-first-delta

`frameloop="demand"`: the first frame after the canvas has been idle reports the
**whole elapsed idle time** as `delta`. Uncapped, that skips the animation
straight to the end the moment you press play (especially on replay after it
settled). Cap it at 0.05s, same as `LabelDeclutter`'s `MAX_DT`.
