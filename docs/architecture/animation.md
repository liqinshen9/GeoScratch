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

### Derivations, not just transformations

`vector_project` and `vector_magnitude` reveal the same way, which is what lets a
distance derivation animate end to end rather than only through its first step.
Two things made that possible.

**Segments grow like arrows.** Both blocks draw plain cylinders rather than shaft
glyphs in their distance forms -- the projection segment, the centre-to-centre
highlight -- and a cylinder has no `setVectorLength`. `utils/segmentGlyph.js`'s
`makeExtendableSegment(mesh, start, end)` attaches one, scaling the mesh along
its own axis and walking the midpoint back so it grows out of `start` instead of
its own centre. The reveal machinery then treats it like any other part.

**A consumer can hand its stage upstream.** A block measuring something another
block drew has nothing of its own to grow for that step. It looks its input's
owner up through `userData.glyph.blockId` and passes that closure as its opening
stage, exactly as `ownerReveal` does in `vector_arithmetic`. So
`magnitude(project(P - Q, n))` plays as one sequence: the point difference, then
the projection segment, then the right-angle illustration.

Note the tag those blocks attach carries **only** `blockId`, never `anchor`.
An `anchor` is what switches on `vector_arithmetic`'s coincident-copy
suppression (see `ownerGlyphs`), which is a separate decision from whether a
reveal can be delegated; tagging an anchor to enable delegation would silently
stop a consumer drawing its own operand.

`vector_magnitude`'s point-plane form draws no geometry at all, only the
`d = ...` label, so it delegates and adds no stage of its own. The label is
rendered by the label layer rather than the reveal, so it is present throughout
the animation rather than landing at the end.

### Reveal order follows the tails

`orderRevealParts(parts)` reorders a stage list so a part whose tail sits on
another part's tip is revealed after it. Socket order is not reveal order: give
`vector_arithmetic` a "from point:" operand -- `u` anchored at `v`'s tip, the
head-to-tail picture of a sum -- and revealing `u` first grows an arrow out of a
point in mid-air. Parts carrying no `anchor`/`tip` keep their position, and the
result arrow is appended after the ordered operands rather than sorted among
them: it closes the picture whatever the operands did.

### One stage per arrow you can see

A stage that grows underneath an arrow already at full length reads as a pause
in the playback, so nothing gets a slot it cannot show.

- Coincident glyphs share one stage, passed as `objs` rather than `obj` --
  Scale Vector at k = 1, where `v` and `k*v` are the same arrow.
- An operand another block already draws is not drawn again here. A vector
  value carries `userData.glyph = { blockId, anchor, objs }` when the block that
  produced it put that exact arrow on screen from that exact tail
  (`linalg_vec3` standalone, `vector_scale`'s `k*v`); `vector_arithmetic`'s
  `ownerGlyphs` reads it, skips the coincident copy and leaves the label to the
  owner. This is the cross-block version of `utils/duplicateVectorRegistry.js`,
  and it also settles a depth fight the copy would otherwise win or lose at
  random.

  That operand still gets its stage. When the owner has an `animate` of its own
  (Scale Vector: `v`, then `k*v`) the slot is handed to that closure -- a part
  of the form `{ animate }` -- and the owner's whole sub-picture plays inside
  it, easing its own stages; otherwise the slot grows `objs`, the owner's
  glyphs. Slots are counted in arrows, not in parts: a reveal closure carries
  `.stages`, and a delegating part claims that many slots, so a nested arrow
  gets the same share of the timeline as a top-level one instead of two arrows
  splitting one arrow's worth of time. Either way the scene starts empty and builds from the origin out
  however many blocks drew it. Two `animate` closures can then drive one glyph,
  which is safe because `AnimationDriver` runs one at a time and snaps the old
  target back to progress 1 when the selection changes. Delegation can't loop:
  provenance only ever points at a block that already ran.

- `userData.hiddenBySetting` marks a glyph a setting has switched off (Vector >
  Show Unscaled Vector). The reveal owns "not yet its turn", not "wanted at
  all", so it never sets `visible = true` on one -- without that, selecting the
  block was enough to bring the hidden arrow back for good.

## Gotcha a refactor would reintroduce

### cap-the-first-delta

`frameloop="demand"`: the first frame after the canvas has been idle reports the
**whole elapsed idle time** as `delta`. Uncapped, that skips the animation
straight to the end the moment you press play (especially on replay after it
settled). Cap it at 0.05s, same as `LabelDeclutter`'s `MAX_DT`.
