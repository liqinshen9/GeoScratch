# The default viewing angle

`DEFAULT_CAMERA_VIEW` in `Scene3D/sceneConstants.js` is where the camera
starts, where "Reset view" returns to, and what `Scene3D`'s `cameraPosition`
prop defaults to. It is an orbit around the origin, and those three numbers are
the only thing to edit:

- `distance`: how far from the origin (30);
- `azimuthDeg`: rotation around the vertical, from +Z towards +X (45);
- `elevationDeg`: angle up from the ground plane (27).

`positionFromOrbit` turns them into `DEFAULT_CAMERA_POSITION`, which is
what the rest of the code reads.

## Why that direction

The 45-degree azimuth comes from the **isometric viewing direction** of
standard axonometry (ISO 5456-3, and every drafting text that covers
axonometric projection), which the default view started as. Looking down
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
three axes, a steeper 45 favours the ground plan at the cost of compressing the
vertical, and a lower angle favours the vertical and reads more like standing
beside the scene. The app started at isometric (distance 56) and was lowered to
27 degrees at distance 30, keeping the 45-degree azimuth so X and Z still leave
the origin symmetrically.

27 was chosen by eye. The literature supports a range, not a number: people
prefer a three-quarter view from slightly above (Palmer, Rosch & Chase 1981;
Blanz, Tarr & Bulthoff 1999), and perceive surfaces as if viewed from above
(Mamassian & Landy 1998). Secord et al. 2011 ("Perceptual models of viewpoint
preference", ACM TOG) score elevation with a Gaussian peaking at 22.5 degrees
with a 45-degree width. That peak is the authors' encoding of Blanz et al.'s
qualitative finding, not a fitted optimum, and anything from about 10 to 35
degrees scores within a few percent of it. Do not tune the angle towards 22.5
on the literature's account.

For depth and relative-position judgments, which the perceptual exercises and
the study ask for, 3D perspective views are worse than for shape understanding
(St. John et al. 2001, Human Factors), so no viewing angle removes the need for
depth cues.

## Who depends on it

- **The perceptual exercises** (`closer-object`, `line-in-front`) derive their
  answer key from it at module load via `exercises/shared/defaultView.js`, so
  moving the camera moves the correct answer with it. Their _composition_ does
  not follow automatically -- check that the objects still read well in the
  view after changing it.
- **Study Phase 1** derives its trial camera from `DEFAULT_CAMERA_VIEW` and
  `CAMERA_FOV`, at its own distance (`study/phase1/stimulusConfig.js`), so
  editing the default view moves the trial camera too. Every stimulus is placed
  and graded against that camera, so the edit also invalidates the fixed
  stimulus set: bump `STUDY_STIMULUS_SEED` with it. See
  [study-phase1.md](study-phase1.md).
- **The overhead light** is placed relative to this view's azimuth, so editing
  the default view keeps it on the viewer's left. It is fixed in world space
  and does not move when the user orbits. See [shadows.md](shadows.md#where-the-overhead-light-sits).
