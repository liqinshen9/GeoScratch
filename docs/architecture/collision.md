# Tube collision zones

`utils/tubeCollision.js`. Finds where each `geo_vector_line`'s visible tube
passes into a solid object, and tells each line the local zone(s) to ring via
its `userData.setCollisionZones(zones)` hook. `applyTubeCollisions(threeObjStore)`
runs once after each scene (re)generation.

## What collides with what

`SOLID_GEO_TYPES` = cube, sphere, teapot, point-normal plane, annotated object.
**Line-vs-line is intentionally excluded** - those get a halo treatment, not a
ringed-tube accent.

Accent accuracy is measured against the plain tube's own radius:
`PLAIN_TUBE_RADIUS = 0.051`, `SOLID_INFLATE = PLAIN_TUBE_RADIUS` exactly (no
extra buffer) - the ring starts where the tube's _surface_ meets the solid's
surface, not where its centerline does.

## Annotated objects

"Show point on object" (`objectComposition.js`) deletes its object from the store
and stores an `annotated_object` group in its place: the object plus a point
marker. `applyTubeCollisions` unwraps that group (`unwrapAnnotated`) before
sorting objects into lines and solids, on both sides:

- **As a collider**, the group is its wrapped object: a plane collides as a
  plane, a sphere as a sphere, and a line not at all. Treated as a box, a tilted
  plane's world AABB is far larger than its square, so a line lying in the
  plane was dashed well past the plane's edges. A wrapped line became a solid
  box too, quietly reintroducing line-vs-line collisions.
- **As a line**, a wrapped line gets zones like any other. The skew-lines
  exercise builds L2 twice, once alone and once inside "point on L2"; the lone
  copy collided with its twin's box along its whole length and drew dashes on
  top of an identical solid tube, which z-fought as a flicker. Unwrapping only
  the colliders would stop that case but leave the two copies accented
  differently next to any real solid.

## Per-collider strategy

| Collider           | Test                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sphere             | `raySegmentSphereIntersection` - analytic, radius padding baked in. A sphere's Minkowski sum with the tube-radius sphere is just a bigger sphere (no angle dependence), so this is exact. |
| point-normal plane | `findLinePlaneCollisionZone` - a plane has no inside, so an ordinary crossing angle is not a collision. Only a line both parallel to the plane (`                                         | dir . normal | <= PLANE_PARALLEL_DOT_TOLERANCE`, 0.02) **and** within `radius`of its surface gets a zone, clipped to the plane's finite square (Liang-Barsky-style interval clip on`basisU`then`basisV`). |
| everything else    | `findBoxTubeCollisionZone` on the world AABB - exact for a cube, an approximation for the teapot / composed objects.                                                                      |

`findBoxTubeCollisionZone` is exact at any approach angle: a box's Minkowski sum
with a sphere has **rounded** edges/corners, which neither inflating the AABB
(sharp corners stick out too far) nor padding a flat-face intersection along the
ray (under/overshoots by incidence angle) reproduces. Distance from a point to a
convex set, composed with a line, is convex and therefore unimodal in `t`, so
the minimum is found by ternary search and the radius-crossings by bisection
outward from it - exact to numerical precision, no per-case face/edge/corner
geometry.

## World-space transforms

`worldSegment` and `worldPlaneFrame` both push build-time local-space data
through `matrixWorld`, because transform pipelines mutate a group's local matrix
after creation and solids may live under different transforms.

- The line uses `userData.segmentMid` (not the vector equation's origin) as its
  reference point: the line can now extend a different distance in each
  direction to reach the scene bounding box, so `segmentMid` is the only point a
  single symmetric half-extent is valid around.
- `worldPlaneFrame`'s `basisU`/`basisV` reconstruct the exact rotation
  `parametricPlane.js` uses (default +Z -> normal), so the collision square
  lines up with the rendered square's edges.

## Gotcha a refactor would reintroduce

### sphere-double-translate

For a sphere collider, `obj.userData.centre` is the **same** local offset
already baked into `obj.position` (see `geoSphere.js`), so it is already part of
`matrixWorld`'s translation. Applying `matrixWorld` to it again double-translates
the center. Use `obj.getWorldPosition()`, which reads that translation once.
