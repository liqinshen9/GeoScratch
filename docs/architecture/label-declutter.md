# Label declutter

`components/Scene3D/labels/LabelDeclutter.jsx`. Keeps 3D-object labels from
overlapping each other on screen by nudging overlapping ones apart every frame.

## Model

Each label is a **point mass** with:

- a **spring** pulling it toward a home position, and
- **continuous pairwise repulsion** against every other label.

Integrated with semi-implicit Euler, damped, in several small sub-steps per
frame. Rest is wherever spring and repulsion balance.

The label registry is a plain module-level `Map`, **not** React context: drei's
`<Html>` mounts its children into a separate ReactDOM root, so context from
above `<Html>` is invisible inside it. `labelRegistryRevision` is bumped on every
add/remove/anchor-move so the sim knows to restart its settle budget.

Runs on `useFrame` every rendered frame (not a fixed tick) so label motion
matches the rest of the scene; a coarser cadence looked stepped next to
full-framerate scene motion. The canvas is `frameloop="demand"`, so the sim
calls `invalidate()` while labels are still settling and stops when they rest.

## Tuning constants

All hand-tuned by feel, not derived. `LABEL_SCALE_*` gently scale labels with
camera distance (tightly clamped 0.6..1.0). The mass-spring constants:

| Constant                  | Value   | Role                                                     |
| ------------------------- | ------- | -------------------------------------------------------- |
| `SPRING_K`                | 450     | spring-to-home stiffness                                 |
| `DAMPING_RATE`            | 20 /s   | velocity decay `exp(-rate * t)`, step-size independent   |
| `REPEL_K_OVERLAP`         | 13000   | repulsion per px of rect penetration                     |
| `MAX_PAIR_FORCE`          | 15000   | per-pair force clamp                                     |
| `GAP`                     | 8 px    | visual gap once rects separate                           |
| `SIGN_SMOOTH`             | 3 px    | smoothing width for per-axis push sign                   |
| `AXIS_BLEND`              | 0.5     | how far the push favors the cheap axis over the diagonal |
| `FORCE_DEADZONE`          | 2 px    | outward shift of the zero-force point                    |
| `MAX_OFFSET`              | 55 px   | hard cap on drift from anchor                            |
| `EMPHASIS_MASS`           | 2.5     | emphasis labels resist being pushed                      |
| `MAX_DT`                  | 0.05 s  | single-frame step cap                                    |
| `TARGET_SUBSTEP_DT`       | 0.006 s | each sub-step aims for ~this duration                    |
| `SLEEP_VELOCITY`          | 3 px/s  | below this, velocity snaps to 0                          |
| `MAX_LABEL_SETTLE_FRAMES` | 180     | bound on one settling burst                              |

`minkowskiSafeDist(nx, ny, cHW, cHH)` is the exact "just touching" center
distance for two axis-aligned rects along a direction: the Minkowski-sum
boundary is itself a rectangle, so it's whichever axis the ray exits first.

## Gotchas a refactor would reintroduce

### repulsion-continuity

Repulsion is linear in penetration depth and **exactly 0 the instant the rects
stop overlapping** - the force must be 0 at the overlap/no-overlap boundary from
both sides, or the pair oscillates forever across it (kicked out by a
discontinuous jump, drifts back under the spring, kicked out again). A separate
"soft anticipatory" falloff zone for not-yet-overlapping labels was tried and
removed for exactly this: its force didn't reach 0 at the boundary, so it fought
the overlap regime and never converged.

### force-balance

The spring never stops pulling toward home, even while repulsion is active, so
rest sits at a nonzero residual penetration **unless repulsion heavily dominates
the spring**. A weak ratio (the original 900:140) settled with labels still
visibly touching, worst for two wide side-by-side text labels. Keeping
`REPEL_K_OVERLAP` an order of magnitude above `SPRING_K` pushes residual
penetration to near-zero without changing the (still continuous, stable)
convergence.

`SPRING_K` is deliberately strong so a label only drifts from its own anchor as
much as needed to clear another, and snaps back once clear. A weak spring let
labels settle far from their anchor when two labels' homes were close together
on screen - nothing pulled the pushed-out label back once it escaped the overlap
zone. `DAMPING_RATE` is scaled up alongside `SPRING_K` (roughly `sqrt(k)`) to
stay critically damped.

### repel-ratio

`REPEL_K_OVERLAP` must stay well above `SPRING_K` by more than ~30:1, **not just
scaled by the same factor**. A scene with several nearby labels has several
pairs pulling on one label at once, diluting how hard any one pair can push
against the spring; a same-factor bump left 3-4-label clusters with a small
residual overlap that the current ratio clears.

### force-deadzone

Force is 0 exactly at the boundary (a single point), so sub-pixel noise there
flips a label between "barely overlapping" and "barely clear" each sub-step,
injecting a tiny force each time - a persistent low-amplitude hover that never
settles. `FORCE_DEADZONE` shifts the zero-force point outward by a couple px,
turning that point into a small band where noise stays force-free.

### substeps

The sub-step count is derived from the frame's `dt`, not fixed. A fixed count
tuned for 60fps was too coarse on a slow/throttled display where each frame's
`dt` is near `MAX_DT` and needs proportionally more subdivision. Sub-stepping
also fixes stiff-force / coarse-timestep overshoot: summed pairwise forces can
move a label further in one step than the separation being resolved, which was a
second, independent source of flicker.

### sleep-velocity

`SLEEP_VELOCITY` snaps near-equilibrium velocity to exact 0. Without it labels
creep by sub-pixel amounts forever - invisible in settle-time numbers, visible
on screen once labels update every frame instead of every ~50ms.

### base-offset

A label's spring rests at a small fixed **screen-space** offset (`BASE_OFFSET_*`,
~16px up-and-right), never `(0,0)`. A label's world-space authoring offset can
project to ~zero screen displacement from some camera angles (offset vector
pointing along the view direction), letting the label render on top of the
object it labels. A fixed screen-space offset is applied after projection, so
it's the same nudge regardless of camera angle.

### registry-key

The register/unregister effect is keyed on `id` **alone**. `worldPos` / `emphasis`
are only initial values; a second effect writes later changes onto the live
entry in place. Adding them to the first effect's deps would drop and re-add the
entry on every camera-driven change, losing its settled offset and velocity. On
a genuine anchor jump (scene rebuild) the second effect kills velocity to avoid
a flick but keeps the offset as a warm start.

### transform-order

`applyLabelTransform` emits `translate3d(...)` **before** `scale(...)`. A CSS
transform list applies right-to-left, so this keeps the translation in true
screen pixels, independent of scale. Swapping the order makes
`MAX_OFFSET` / `GAP` / `REPEL_*` scale-dependent - don't "clean it up".

### axis-weighting

The pairwise push direction is per-axis (Manhattan-flavored): each axis is
weighted inversely to its own overlap depth, so separation happens mostly along
whichever axis has less overlap (cheaper to resolve) rather than the
center-to-center diagonal. The per-axis component uses a **smoothed sign** of
`dx`/`dy` (`SIGN_SMOOTH`), not `dx`/`dy` directly: raw values let whichever axis
had the larger separation dominate regardless of weight (`dy~1px` but `dx~60px`
still gave an almost-pure-X push when Y was the cheaper axis), which left a
real 4-label case with a pair still overlapping. Smoothing keeps it continuous
through zero, same reasoning as `force-deadzone`.

### axis-blend

`AXIS_BLEND` blends toward the per-axis direction rather than fully committing.
Full commitment works for an isolated pair, but with several interacting pairs,
different pairs prefer conflicting axes and fight - a real 4-label case left a
pair overlapping. Keeping a diagonal component to fall back on trades per-pair
efficiency for robustness.

### pairwise-cost

Repulsion is O(n^2), fine at a few dozen labels. Perfectly coincident labels
(multiple labels on one anchor) fan out in a deterministic per-pair direction
(`i * 2.399963 + j * 0.618034`), not an arbitrary one.

### dom-batching

Pass 2 batches all `getBoundingClientRect()` reads before any writes to avoid
layout thrash. Rect size / natural center are computed once per outer tick, not
per sub-step - offsets move within the tick but rect geometry doesn't change
without a fresh DOM read.
