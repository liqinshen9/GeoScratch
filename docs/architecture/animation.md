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

### Sweeping a point instead of revealing

A point-plane distance does not use a staged reveal. Growing the pieces in
sequence shows how the picture was _constructed_; it does not show why the
projection is the _answer_. So `vector_project` swaps the reveal for a sweep
when its input is a point difference: Q slides across the plane, `P - Q` swings
and stretches with it, and the perpendicular stays put at length d.

Two things make it work, and both were wrong in the first attempt.

**The perpendicular has to be anchored at P's own foot.** It used to start at Q
and rise to height d, so it travelled with Q and nothing stayed fixed to compare
against.

**Q has to sweep THROUGH the foot, not around it.** A circle about the foot
keeps Q at a constant distance from it, so `|P - Q|` stays at
`sqrt(d^2 + r^2)` for the whole animation and the sweep demonstrates nothing.
Q instead orbits a circle whose diameter runs from its own resting place to the
foot, so the path passes through both: Q at progress 0 and 1, the foot at 0.5,
where `|P - Q|` is exactly d. In between it varies smoothly, which is the whole
demonstration -- the projection is visibly the shortest of them.

The orbit's radius breathes slightly so it does not look mechanical, and the
frequencies for that are not free. Only even multiples of the base frequency are
used, because those are the terms that vanish at progress 0, 0.5 and 1. The
variation therefore never disturbs either fixed point. Choosing frequencies
freely loses the resting position, the foot, or both.

The closure sets `durationScale = 4`. A staged reveal is a short build-up and the
configured 1.5s suits it; a path has to be followed rather than watched go past.
`AnimationDriver` divides its per-frame step by that scale, so the speed control
still applies on top.

`makeStagedVectorReveal` propagates the largest `durationScale` among the
closures it delegates to. Without that the scale never reaches the driver: it
reads the value off the **selected** object, and the block a student selects is
the outermost one, which delegates to the sweep rather than being it. The sweep
ran at 1x until that was fixed.

The sweep reaches across blocks, which a reveal never has to: the marker belongs
to `geo_show_point_on_object`, the arrow to `vector_arithmetic`, the guide line
to the illustration. `geo_show_point_on_object` therefore tags its returned point
with its own `srcBlockId`, and `vector_arithmetic` carries that onto the point
difference as `startBlockId` -- it assigns `userData` wholesale, so anything not
copied explicitly is lost there. Re-aiming the arrow needs
`setVectorSegment`, since a swinging vector changes origin and direction as well
as length.

Labels do not follow the sweep. `labelAnchors` are read on React render, not per
frame, so a moving object's label stays where it started until the next scene
rebuild.

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

### Subtraction shows the negative

`vector_arithmetic`'s general `u - v` used to grow `u`, then `v`, then the result
from the origin. That last arrow touches neither operand, so nothing on screen
said why it was the difference.

It now reveals `u`; then `v` and `-v` together; then the result; then two last
slots (`holdNegated`, `stages = 2`) that hold `-v` against the finished result
for their first 20% and fade it out slowly over the rest; and `-v` is hidden at
progress 1. The second fade slot is extra time: the reveal's `durationScale` is
multiplied by `stages / (stages - 1)`, so `u`, `v` and the result keep the pace
they had with a one-slot fade instead of being squeezed to make room.

`-v` grows inside `v`'s slot rather than taking one of its own. `v`'s stage is
tagged `isSubtrahend` before `orderRevealParts` runs, then wrapped in a closure
that plays it through `makeStagedVectorReveal([part])` -- so an owner's
delegated reveal still works -- and grows `-v` over the same progress. The whole
reveal is wrapped once more to hide `-v` at progress 1; that is also the last
frame of any consumer's slot this reveal is handed, so a delegating block leaves
it hidden too.

The fade is `setGlyphOpacity` on the shaft glyph (`vectorShaftGlyph.js`). It
flips `transparent` and `depthWrite` only at the ends, so a fade recompiles
twice rather than every frame, and it hides the halo companions while the arrow
is see-through, since they would still cut gaps in lines behind it. Only the
hold slot sets `-v`'s opacity: every slot runs every frame with its own local
progress, so a second writer (say, `v`'s slot resetting it to 1) would flip it
back and forth each frame and recompile continuously. Scrubbing back into an
earlier slot gives the hold slot progress 0, which restores opacity 1. The `-v`
label hides once the fade passes halfway. Its `-v` label uses `revealed: () => negatedV.visible`, so it is
hidden at rest as well as before its slot.

`negatedV` is added to the group hidden and is not registered in
`threeObjStore`, for the same reason as the point-difference guides below.

This replaced a tip-to-tip version (grow the result from `v`'s tip to `u`'s tip,
then slide it to the origin).

The point-difference form (`P - Q`, both operands points) works differently.
It rests from `Q` to `P`, and it used to grow that one arrow on its own with
nothing on screen for `P` or `Q` as vectors, which read as though `P - Q` were
just `P`. Now `P` and `Q` grow from the origin as position vectors, then the
difference grows from the origin too -- the free vector it is -- and slides over
to run from `Q` to `P`, its label riding along. Four slots: two guides, grow,
slide. It ends where its static scene draws it.

The guides are the operand arrows this path always built and never showed. They
are added to the group hidden and made visible only while progress is below 1,
so a scene that never animates, and every animation's last frame, look exactly
as before. They are not registered in `threeObjStore` (the point path never
registered its operands, and an exercise checker scanning the store would count
two extra vectors), so a line-style change will not restyle them until the next
rebuild.

### Labels wait for their arrow

Labels are rendered by the label layer, not the reveal, so every label used to
show from the first frame -- `V2` and `V1 - V2` floating over empty space while
`V1` was still growing.

A label descriptor can carry `revealed: () => boolean`. The blocks that reveal
(`vector_arithmetic`, `vector_cross_product`, `vector_scale`,
`vector_magnitude`, `vector_project`) set it to "the glyph I name is visible",
which is exactly what the staged reveal toggles per stage. `LabelDeclutter`
hides a label while it returns false and leaves it out of the declutter sim, so
a hidden label does not shove visible ones aside. It is a function, not a stored
glyph, so nothing ever tries to copy an Object3D out of `userData`.
`vector_magnitude`'s point-plane form draws nothing, so its `d = ...` label waits
for the upstream projection's `distance_segment`.

Anchors re-resolve while playing **or scrubbed below progress 1**, plus one
frame after coming to rest. Scrubbing sets `playing` false, so a playing-only
check left a moving label behind for the whole scrub.

## Gotcha a refactor would reintroduce

### cap-the-first-delta

`frameloop="demand"`: the first frame after the canvas has been idle reports the
**whole elapsed idle time** as `delta`. Uncapped, that skips the animation
straight to the end the moment you press play (especially on replay after it
settled). Cap it at 0.05s, same as `LabelDeclutter`'s `MAX_DT`.
