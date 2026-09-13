# Study Phase 1: perceptual discrimination trials

Phase 1 of the user study is a two-alternative forced choice depth-ordering
task: a static scene with two targets labelled **A** and **B** that cross on
screen (two lines, or a point over a line), and the participant clicks which one
is in front where they cross. "Which is nearer?" is deliberately not the
wording: an infinite line has no single depth, so the question only has one
answer at the crossing. Ten rendering techniques (T1-T10) x two
clutter levels, within subjects. The protocol itself is specified in the
dissertation Method; this doc covers how the code realises it.

Route: `/study/phase1` (participants), `/study/phase1/preview` (dev only).
Code: `src/study/phase1/`, `src/pages/StudyPhase1Page.jsx`.

## Conditions

`conditions.js`. Each technique is a **complete** settings object applied
through `setExerciseOverrides`, the same layer an exercise uses to lock a
setting. Pinning every key (not only the cue keys) means nothing a participant
set on this device can leak into a trial. Non-cue keys keep `DEFAULT_SETTINGS`,
so the scene looks like the normal 3D view; only `theme` (light) and
`autoFocusOnNewObject` (off, it would move the camera) are forced.
`conditions.test.js` fails if a technique differs from its base in anything
beyond the cue the Method's table names.

## Same 3D view

The trial scene is not a copy. It is the real `Scene3D`, fed by the real
`runAndSync` pipeline. `Scene3D` has three opt-in props that change **input,
label visibility and camera-only overlays**, never the scene itself:

- `interactive={false}`: OrbitControls disabled, block selection off, and the
  orientation gizmo and view buttons are not rendered, since they only control
  the camera and would look clickable. This is done in `Scene3D`, not by turning
  off `showAxisGizmo`: that setting also switches the in-scene axis end labels
  on, which would change the scene. The camera stays at
  `DEFAULT_CAMERA_POSITION`, which the ground-truth camera also uses.
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

- **Ground truth** is camera-space depth where the two targets meet on screen:
  the targets are placed on the view ray through a crossing point S, at depths
  `base +- gap / 2`. A point target's depth is its own; a line target's is the
  point on the line closest to the ray through S. `targetDepths` recomputes this
  from the rounded values actually written into the blocks.
- **Lines are box-clipped lines, not finite segments.** No segment block
  exists; the depth question is well posed at the crossing.
- **Targets never touch in 3D.** A target pair, and any distractor line and a
  target line, stay at least `minSeparation3d` apart (closest approach via
  `closestApproach` in `lineIntersection.js`). Two lines that genuinely meet are
  made immune to each other's halo (`haloIntersectionRegistry.js`), which would
  silently remove the T5/T10 cue. The depth gap at the crossing does not
  guarantee this on its own, because lines tilt in depth.
- **Labels must read as belonging to their line.** A line's label is anchored
  at its box-clipped midpoint (`segmentMid`), which `lineLabelAnchor` mirrors
  (`stimulusScene.test.js` builds a real scene to pin the two together). A
  target is rejected unless that anchor is on screen, clear of the crossing and
  of the other target, and distractors are kept off it. A point's label stays
  at the point, which necessarily sits over the other line.
- **Halos never help line/point pairs.** Only lines and vectors get the halo
  discard material, so in line/point trials T5 renders like T1. Analyse pair
  type as a factor, or make every pair line/line.
- **Difficulty** is the depth gap, `DEPTH_SEPARATIONS`. Those numbers are
  placeholders until the pilot. 8 measured stimuli per clutter level cannot
  split evenly across 3 levels, so `MEASURED_DIFFICULTY_COUNTS` rotates which
  level gets 2.
- **Distractors** are placed within `distractorRadiusNdc` of S, and kept off S
  itself (points and lines by screen distance, solids by projected radius), so
  clutter adds crossing and occlusion without hiding the judgement point.
- **Every scene has a solid threaded on a target line** (away from S). Without
  one, T4's collision accents and T7's camera shadows (solids only) have nothing
  to draw, and T4 would render identically to T1.
- Which target is nearer and the pair type are balanced within each clutter
  level; which letter is the point (in line/point pairs), line angles and the
  colour salt are drawn per stimulus.

## Scene build

`stimulusToXml.js` writes the stimulus as ordinary blocks; `buildStimulusScene`
loads them into a headless `Blockly.Workspace` and runs `runAndSync`, so the
generator, runtime, builders and tube collisions are the editor's own.

- Block ids are `p1-<stimulusId>-<colourSalt>-<key>`. Colour is a hash of the
  block id (`color-system.md`), so colours are random per stimulus but identical
  across techniques.
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
practice trials with Correct/Incorrect feedback, 16 measured trials in shuffled
order without feedback, and a block-end screen (placeholder for the per-block
Qualtrics questionnaire). Each trial starts with a 500 ms fixation cross; the
scene is built during it, so build cost never falls inside a reaction time.

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
id and seed, correct target, response, correctness, `rt_ms`, the full resolved
settings snapshot, viewport and device pixel ratio, and `build_commit` (from
`vite.config.js`'s `define`, `VERCEL_GIT_COMMIT_SHA` or `git rev-parse`).
Practice trials are logged with `is_practice = true`. `label_toggles` counts
clicks that hid or showed A's or B's label before the answer.

Export:

```sql
select * from phase1_export where cohort = '<cohort>' and not is_practice;
```

## Not built yet

- Generated research IDs (the typed participant code is used for now).
- Qualtrics handoff and return between blocks.
- Session-level rows (study setting, viewport at session start).
