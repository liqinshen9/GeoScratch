# The default viewing angle

`DEFAULT_CAMERA_POSITION` in `Scene3D/sceneConstants.js` is where the camera
starts, where "Reset view" returns to, and what `Scene3D`'s `cameraPosition`
prop defaults to. It is `[32.33, 32.33, 32.33]`: distance 56 down the
`(1, 1, 1)` diagonal.

## Why that direction

That is the **isometric viewing direction** of standard axonometry (ISO 5456-3,
and every drafting text that covers axonometric projection). Looking down
`(1, 1, 1)`:

- the ground plan is turned 45 degrees, so the X and Z axes leave the origin
  symmetrically, one to each side, and a solid shows two faces of equal weight;
- all three axes are equally foreshortened and sit 120 degrees apart on screen,
  so no axis is privileged over the others -- the right property for a tool
  whose subject is the three axes themselves;
- no axis projects onto another.

The view before this was `[0, 25, 50]`: straight down -Z from 26.6 degrees up.
That put the Z axis directly behind the Y axis on screen -- the two overlapped,
and depth along Z had no screen direction of its own to move in.

A true **military projection** (undistorted plan, verticals drawn vertically,
plan turned 45) is what that overlap problem usually sends you looking for, and
it is a good instinct, but it is an _oblique_ projection: the plan is drawn
true and the verticals are bolted on. No single perspective or orthographic
camera produces it. The isometric direction is the nearest thing a real camera
can do, and it keeps the 45-degree plan rotation that made military projection
attractive in the first place.

Elevation is a trade-off, not a fact: 35.26 degrees (isometric) balances the
three axes, while a steeper 45 degrees favours the ground plan at the cost of
compressing the vertical. This app picks the balanced one.

## Who depends on it

- **The perceptual exercises** (`closer-object`, `line-in-front`) derive their
  answer key from it at module load via `exercises/shared/defaultView.js`, so
  moving the camera moves the correct answer with it. Their _composition_ does
  not follow automatically -- check that the objects still read well in the
  view after changing it.
- **Study Phase 1** uses the same direction at a closer distance
  (`study/phase1/stimulusConfig.js`), and every stimulus is placed and graded
  against that camera. Changing it invalidates the fixed stimulus set, so bump
  `STUDY_STIMULUS_SEED` with it. See [study-phase1.md](study-phase1.md).
