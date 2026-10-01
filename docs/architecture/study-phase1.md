# Study Phase 1: perceptual discrimination trials

Phase 1 of the user study is a two-alternative forced choice depth-ordering
task: a static scene with two targets labelled **A** and **B**, and the
participant clicks which one wins a depth comparison. Nine rendering
techniques (T1-T8 and T10) x two clutter levels, within subjects. The
protocol itself is specified in the dissertation Method; this doc covers how
the code realises it.

T9 (high-contrast palette) was dropped on 2026-09-30: it keeps each type's
lightness equal and changes only hue and chroma, so it carries no depth. T8
(monochrome) was dropped with it and restored on 2026-10-01, on a different
hypothesis: not that a palette carries depth, but that without hue it is harder
to tell which objects overlap, since hue is what separates one object from the
next where they cross. Lines are grey under every palette, so T8 differs from
T1 only where a vector, point or solid is involved. The IDs are not renumbered,
so T10 still names the combination in logs, survey images and the Method.

Nine is odd, so the Williams design is the square plus its rows reversed: 18
orders (`williams.js`), each condition twice in each position and each ordered
pair of neighbours twice. Slots repeat every 18.

Route: `/study/phase1` (participants), `/study/phase1/preview` (dev only).
Code: `src/study/phase1/`, `src/pages/StudyPhase1Page.jsx`.

## Questions

An infinite line has no single depth, so every trial has to name _where_ it is
asking about. Three question types do that, each crossed with difficulty within
each clutter level (`questionCopy.js` holds the participant-facing wording):

- **occlusion** -- the targets cross on screen. "Line A and Vector B do not
  touch. Where they overlap on screen, which one is in front?" Saying they do
  not touch heads off reading the overlap as a collision. The judged point is the crossing.
- **proximity** -- the targets are apart on screen, and a shaded vertical band
  (left, middle or right third) marks a column of it. "Inside the shaded band,
  which one is closer to you?" The judged point is that column.
- **distance** -- a labelled point C on a line, and "Point C sits on a line.
  Which of these two is closer to Point C?" / "Any point on Line A or the tip
  of Vector B?" See [Distance questions](#distance-questions).

The band is a DOM overlay on the stage, not scene geometry, and is drawn
identically under every technique. The prompt and the button labels follow the
question type and name each target with its kind ("Line A", "Sphere B"), and both appear during the fixation cross, so the reaction time
measures the judgement rather than the reading.

A trial's question type and band are logged (`question_type`, `probe_band`,
migration `0003_phase1_questions.sql`).

## Conditions

`conditions.js`. Each technique is a **complete** settings object applied
through `setExerciseOverrides`, the same layer an exercise uses to lock a
setting. Pinning every key (not only the cue keys) means nothing a participant
set on this device can leak into a trial. Non-cue keys keep `DEFAULT_SETTINGS`,
so the scene looks like the normal 3D view; only `theme` (light) and
`autoFocusOnNewObject` (off, it would move the camera) are forced.
A glyph cue sets `lineStyle` **and** `vectorStyle`, so T2's unshaded lines and
T3's ringed tubes apply to line and vector targets alike; so do T5's halos
(`haloEnabled` + `haloLineVectorEnabled`). T1, the reference, draws the app's
default tubes, so every single-cue condition adds its cue to tubes and T2
measures what the flat lines of conventional tools cost.

`solidOpacity: 0.8` is held constant in every condition: one value for every
solid type, where the editor uses each builder's own (cube 0.7, sphere and
teapot 0.8), so a cube distractor and a sphere distractor differ only in shape.
`null`, the app default, leaves each builder's own value in place.

Solids stay see-through on purpose. A line behind one reads tinted rather than
hidden, which looks like a depth cue in every condition, but it is also the only
reason T4's collision accent is visible at all: the accent is drawn on the
stretch of line **inside** the solid, so an opaque solid hides the cue under
test. Measured on a line threaded through a sphere, the T4-versus-T1 difference
in the collision zone falls by about 3.5x between 0.8 and 0.95. The line-shaped
artefacts that a cluster of overlapping solids used to show were a draw-order
problem, not a transparency one; see
[render-order.md](render-order.md#solid-depthwrite).

`conditions.test.js` fails if a technique differs from its base in anything
beyond the cue the Method's table names.

## Same 3D view

The trial scene is not a copy. It is the real `Scene3D`, fed by the real
`runAndSync` pipeline. `Scene3D` has a few opt-in props that change **input,
label visibility, the camera and camera-only overlays**, never the scene
itself:

- `interactive={false}`: OrbitControls disabled, block selection off, and the
  orientation gizmo and view buttons are not rendered, since they only control
  the camera and would look clickable. This is done in `Scene3D`, not by turning
  off `showAxisGizmo`: that setting also switches the in-scene axis end labels
  on, which would change the scene.
- `showOrientationGizmo`: the trial page shows the orientation gizmo anyway,
  for orientation only. With `interactive={false}` it is drawn `disabled`, so
  it has no hover and a click cannot turn the camera.
- `cameraPosition`: the trial camera (`CAMERA.position` in `stimulusConfig.js`)
  is derived from the editor's `DEFAULT_CAMERA_VIEW`, with the same azimuth,
  elevation and `CAMERA_FOV` ([camera-view.md](camera-view.md)), at the study's
  own `STUDY_CAMERA_DISTANCE`, because a participant cannot zoom. The angle is
  derived rather than copied, because a hard-coded copy silently kept the old
  isometric view after the editor's view changed. The same constant places and
  grades every stimulus, so the drawn camera and the ground-truth camera cannot
  drift apart. **Changing the editor's default view changes the trial camera and
  invalidates the stimulus set: bump `STUDY_STIMULUS_SEED` with it.**
- `onPresented`: mounts `PresentationProbe` (draws nothing).
- `hiddenLabelKeys`: merged into the existing right-click label-hide set, used
  to hide every label except A and B.
- `onObjectClick`: mounts the existing `ScenePicker` in non-interactive mode; a
  left click reports the clicked top-level object instead of selecting a block.
  The trial page uses it to toggle A's or B's label (`labelToggle.js`), resets
  the toggles every fixation (label keys come from block ids, and a stimulus
  returns under every technique), and ignores distractors. A click on a label
  pill is routed the same way: in the editor a pill click hides that label in
  `Scene3D`'s own state, which would persist across trials here.
- Label `<Html>` wrappers get `style={{ pointerEvents: 'none' }}` (only the
  pill takes clicks). drei's wrapper sits on the label anchor, which for a
  point is the marker itself, so it used to swallow clicks on points. drei's
  own `pointerEvents` prop only applies in transform mode, which labels don't
  use.

If anything is added to `Scene3D` that draws differently when not interactive,
the Method's "one renderer, one scene graph" claim stops being true.

## Stimuli

`stimuli.js`, tuned in `stimulusConfig.js`. One fixed set for the whole study
(`STUDY_STIMULUS_SEED`), so stimulus is a proper random effect and the same
geometry is re-rendered under every technique.

- **Ground truth** is camera-space depth at the judged point. Each target is
  placed on the view ray through its own screen anchor at depth `base +- gap / 2`
  -- one shared anchor for an occlusion question, two anchors in the same screen
  column for a proximity one. `targetDepths` recomputes it from the rounded
  values actually written into the blocks: a point answers with its own depth, a
  line or vector with the point where it meets the crossing ray or the probe
  column (`lineParamAtNdcX` solves that in one step, since clip x and w are both
  affine along the line), and a sphere with its **near surface**, the surface
  being judged.
- **Target kinds** are lines (box-clipped, not segments), vectors (a drawn
  arrow, tail to tip) and spheres, paired by `PAIR_TYPES`. A sphere is a
  transparent solid, so "which one occludes the other" is not well posed for it:
  `OCCLUSION_PAIR_TYPES` leaves sphere pairs out and they are asked as proximity
  questions only.
- **No bare points as targets** in any question (since 2026-10-01). A point
  marker is drawn the same size at any depth, so where a point sits in depth
  cannot be told and a trial that hinges on one is a guess. A point is also an
  opaque ball wider than a line, so a line-point overlap question drew its own
  answer. Points still appear as distractors, and as C in distance questions,
  where C sits on a line.
- **A proximity trial has to stay answerable right across the band.** The same
  target must be nearer, and the two must stay visibly apart, at both band edges
  as well as at its centre (`bandIsUnambiguous`). Targets are placed near
  parallel on screen and not too steeply tilted, or they would converge inside
  the band.
- **Targets never touch in 3D.** A target pair, and any distractor line and a
  target line, stay at least `minSeparation3d` apart (closest approach via
  `closestApproach` in `lineIntersection.js`). Two lines that genuinely meet are
  made immune to each other's halo (`haloIntersectionRegistry.js`), which would
  silently remove the T5/T10 cue. The depth gap at the crossing does not
  guarantee this on its own, because lines tilt in depth.
- **Labels must read as belonging to their object.** A line's label is anchored
  at its box-clipped midpoint (`segmentMid`) and a vector's at its tip;
  `targetLabelAnchor` mirrors both, and `stimulusScene.test.js` builds a real
  scene to pin them against the builders. Such a target is rejected unless that
  anchor is on screen, clear of the judged point and of the other target, and
  distractors are kept off it. A point's or a sphere's label sits on the object
  itself, so it needs no such check.
- **A cue only helps the targets it applies to.** Only lines and vectors get the
  halo discard material and the glyph styles, so in a line/point or line/sphere
  trial T2, T3 and T5 act on one target at most. Pair type is balanced within
  each question type and logged; analyse it as a factor.
- **Difficulty** is the depth gap, `DEPTH_SEPARATIONS`. Those numbers are
  placeholders until the pilot. 18 measured stimuli split as 9 per clutter
  level, 3 per difficulty (`MEASURED_DIFFICULTY_COUNTS`), one of each question
  type in every clutter x difficulty cell. That gives each type 6 trials, with
  the nearer target, the band and the pair type dealt evenly within the type.
  The count dropped from 24 on 2026-10-01 when the third type was added: 24
  cannot be split evenly across three types and their pairings.
- **Distractors** are placed within `distractorRadiusNdc` of the probe, and kept
  off it and off both targets' judged points (points and lines by screen
  distance, solids by projected radius), so clutter adds crossing and occlusion
  without hiding the judgement.
- **No two solids overlap on screen** (`solidClearOfSolidNdc`, counting a sphere
  target as a solid). Solids are see-through and do not write depth, so an
  overlapping pair composites by draw order rather than by depth: the pair can
  read the wrong way round, and an opaque line through them punches a
  line-shaped window in whichever is drawn last. Keeping them apart removes the
  whole class from the stimuli instead of asking the renderer to resolve it.
  See [render-order.md](render-order.md#solid-depthwrite).
- **Every scene has a solid threaded on a line**, offset from the judged point
  along that line. Without one, T4's collision accents and T7's camera shadows
  (solids only) have nothing to draw, and T4 would render identically to T1.
  `applyTubeCollisions` only accents a `geo_vector_line`, so when neither target
  is a line (a vector/vector or vector/sphere pair) the generator adds a
  distractor line to carry the solid; the accent is then present but says
  nothing about A or B. `stimulusScene.test.js` builds every study stimulus and
  fails if any of them has no collision at all. Solids are drawn larger here
  than a hand-built scene would place them (`PLACEMENT.cubeSize` /
  `sphereRadius`): the camera never moves, so whatever they subtend is all a
  participant gets.
- **Only the A/B pair is kept apart in 3D**, because two lines that genuinely
  meet are immune to each other's halo and because the depth question has no
  answer where they touch. Everything else is free to intersect, which is what
  the collision cue is drawn from.
- Difficulty, question type, probe band and which target is nearer are balanced
  within each clutter level. Pair type is dealt from one pool per question type
  across both clutter levels, so each pairing appears equally often overall.
  Which letter gets which kind, the angles, the vector lengths and the colour
  salt are drawn per stimulus.

### Distance questions

Occlusion questions sat near ceiling once the glyphs were the right size, so a
third type asks about distances between objects rather than depth from the
viewer, which is closer to what the authoring tasks need (point-to-plane,
sphere-to-sphere). The prompt is two lines with a blank one between: "Point C sits
on a line. Which of these two is closer to Point C?" / "Line A or the tip of Vector B?"; the
buttons name the two options.

- **C sits on a line.** C is a labelled point (`role: 'reference'`), and an
  unlabelled line runs through it (`role: 'context'`, key `Cline`). A point
  marker is drawn the same size at any depth, so a lone point carries no depth
  of its own; the line gives C a place in depth for the cues to act on. The
  line runs clear of A and B on screen and never touches them in 3D, and it can
  carry the solid that T4 needs.
- **What A and B can be.** A vector (judged by its tip), a line (its nearest
  point to C) or a sphere (its surface): "closer" is always the shortest
  distance. Six pairings, one of each per block (`DISTANCE_PAIR_TYPES`). Never a
  bare point: a point marker has no size cue, so a trial that hinges on one
  came out close to a guess (three points were tried first, then points
  against vectors, and both were dropped). Cubes are left out because the
  distance to a cube depends on its orientation, so the ratio could not be
  exact. A line target is built through its nearest point, perpendicular to the
  direction to C; a sphere's centre goes its radius further out.
- **The screen never gives it away.** `placeDistanceTargets` puts the target
  that is farther from C in 3D `targetScreenPx` from C on screen, and the
  nearer one `screenRatio` (0.95-1.3) times that, so on screen the nearer one
  is about as far away or farther. The check is repeated on what is actually
  drawn (`imagePixelDistance`: to a tip, to a line's image, to a sphere's
  outline), since a line can pass nearer C on screen than the point it was
  built through. The nearer target's 3D distance is
  `depthStretch` times the shortest distance its view ray allows, which forces
  it off C's depth, and the farther one is `DISTANCE_RATIOS[difficulty]` times
  further. Each target sits where its view ray meets that distance, in front of
  or behind, chosen at random. Difficulty is that ratio, a placeholder until
  the pilot.
- **Vectors aim at C**, so a shaft trails away from C and never runs over C or
  the other target on screen. Its tip is where its label hangs.

Stimuli carry `distances` and `distanceRatio` as well as the judged points'
`depths`; rows log `question_type = 'distance'`, and the geometry joins through
`stimulus_id`.

## Scene build

`stimulusToXml.js` writes the stimulus as ordinary blocks; `buildStimulusScene`
loads them into a headless `Blockly.Workspace` and runs `runAndSync`, so the
generator, runtime, builders and tube collisions are the editor's own.

- Block ids are `p1-<stimulusId>-<colourSalt>-<key>`. With per-instance colour
  variation on, colour would be a hash of the block id; `STUDY_PINNED_SETTINGS`
  holds it off, so every object of a type renders its family's midpoint colour
  and the salt no longer affects colour
  ([color-system.md](color-system.md#per-instance-variation)).
- A and B are written as `custom` names in the naming registry's `block.data`
  record, so the label layer shows them like any user-chosen name.
- XML loads with events disabled, **then** `installNamingRegistry` runs, which
  assigns synchronously. Loading with events on would queue asynchronous create
  events against a workspace that is disposed straight after the build.
- **Builders read settings as they run** (glyph style, halos, palette). The
  condition's overrides must be applied before building, and a technique change
  needs a rebuild.

## Session flow

`phase1Flow.js` is a pure reducer: intro, then per block a block intro, 4
practice trials with Correct/Incorrect feedback, 18 measured trials in shuffled
order without feedback, and a block-end screen (placeholder for the per-block
Qualtrics questionnaire). Each trial starts with a 500 ms fixation cross; the
scene is built during it, so build cost never falls inside a reaction time.

The intro is five pages inside the one `intro` state (local page state in
`StudyPhase1Page`): the task, then one page each for halos, collision accents
and ringed lines (one dark + one grey ring is one unit), then the answering
instructions and Start. Every participant sees the
cue explanations before block 1, whatever their order, so when a participant
learns what a cue means never varies with the Williams row. The pictures are
`public/study/cue-*.png`, rendered from `/study/showcase?cue=halo|accent|rings`
under T5 / T4 / T3 (the rings view from closer, so each ring is countable) with the trial's own settings (`scripts/surveyScreenshots.mjs`), and
shown at their rendered 512 px so the marking is the size it is in a trial.

A cursor (`geoscratch:phase1-progress:<code>`) is saved after every step. A
reload resumes at the start screen of the block it was in, continuing from the
next unanswered trial.

### Sequence seeding

`sequence.js` derives everything from the participant code: the Williams
square row (`williams.js`) for technique order, and per-block shuffles seeded
by `<code>:phase1:block<i>`. A trailing number in the code picks the row in
order (P01 -> row 0 ... P10 -> row 9, P11 wraps), so **hand out numbered codes**
to fill the square evenly; other codes fall back to a hash. The resolved
sequence is written to `profiles.phase1_sequence`.

## Onset timing

Reaction time runs from `PresentationProbe`'s `useFrame` on the first frame
that has the new objects, to the answer button's `click`, both via
`performance.now()`. With `frameloop="demand"` the probe invalidates so that
frame is rendered immediately. The timestamp is taken just before the frame is
drawn, so it leads the actual display by up to one frame; that offset is the
same in every condition, so technique contrasts are unaffected.

Clicks before the onset frame are ignored.

## Logging

`usePhase1TrackingStore` inserts one `phase1_trials` row per answered trial
(`supabase/migrations/0002_phase1_trials.sql`), fire-and-forget like every
other write (`backend.md`). Rows carry technique, clutter, difficulty, stimulus
id and seed, question type and probe band, correct target, response,
correctness, `rt_ms`, the full resolved settings snapshot, viewport and device
pixel ratio, and `build_commit` (from
`vite.config.js`'s `define`, `VERCEL_GIT_COMMIT_SHA` or `git rev-parse`).
Practice trials are logged with `is_practice = true`. `label_toggles` counts
clicks that hid or showed A's or B's label before the answer.

### Height in the visual field

`nearer_higher` (migration `0006_phase1_nearer_higher.sql`) records whether the
nearer target's judged point sits higher on screen than the other's. On a
ground plane, higher in the image means farther, and people apply that without
thinking; but the study camera sits above the scene looking down, so raising an
object moves it up on screen and toward the camera at once. Where the nearer
target is the higher one, the heuristic pulls towards the wrong answer.

The generator balances it: within proximity and distance questions the nearer
target is the higher one in exactly half the trials (`highersForTypes`; a
proximity question places the targets to match, a distance question retries
until it does). For a distance question "higher" compares the points nearest
C: a vector's tip, a line's foot, a sphere's closest surface point
(`nearerIsHigher`). Null for occlusion, where both targets meet at the
crossing. Techniques that convey depth should shrink the effect, so it is worth
analysing as a factor, not only controlling.

### Shadow visibility

`shadow_visible_a` / `shadow_visible_b` (migration
`0005_phase1_shadow_visibility.sql`) say how much of each target's overhead
shadow a participant could see: 0..1, where a point or sphere is 0 or 1 and a
line or vector is the share of its drawn length. Only the room receives
shadows, and its floor is at y = -20, so a target's shadow often lands low or
off screen, or on a near wall the camera culls (`shadowVisibility.js` follows
the light's ray through the target to the room and applies the same face
culling as `BoundingBoxRoom`). It is geometry, not pixels: it ignores objects
standing in front of the shadow, and a thin tube's shadow can be in view yet
faint. It is logged for every trial and only means something under T6, T7 and
T10, e.g. `where technique in ('T6','T7','T10') and shadow_visible_a = 0`.

Export:

```sql
select * from phase1_export where cohort = '<cohort>' and not is_practice;
```

## In a study session

Under `/study`, research IDs, the slot that picks the Williams row, the
questionnaire after each block, and session-level rows are handled by the
session flow: see [study-session.md](study-session.md). Outside a session (no
slot), the numbered-code fallback above still applies.
