# Transparent render order (#29)

`utils/nestingRenderOrder.js`, `components/Scene3D/SceneFurniture.jsx`.

## The recurring bug class

Three.js sorts the transparent queue by distance to bounding-sphere centre.
Objects with near-coincident centres - a teapot inside a cube, an axis passing
through an object, a grid line under everything - have their sort order flip with
the smallest camera jitter, and the pair visibly flickers as paint order
flip-flops. This has recurred several times; #29 tracks it.

The fix is always the same shape: replace the per-frame distance sort with a
**fixed `renderOrder`** that pins the back-to-front order.

## computeNestingRenderOrders

Derives a stable `renderOrder` from bounding-box **containment**: an object
nested inside another renders earlier (further back), so the container
consistently blends over it regardless of viewing angle. `renderOrder =
-(number of boxes that mostly contain this one)`.

`boxMostlyContains(outer, inner)` is a tolerant `containsBox`: a spout / handle /
gridline can poke a little way outside (a teapot's bounding box is actually wider
than the cube it sits in), so it requires the inner centre inside, the inner box
smaller, and >= 60% of the inner volume overlapping.

## SceneFurniture fixed render orders

- **Axes**: `shaft.renderOrder = head.renderOrder = -100`. The axis material is
  `transparent` + `depthWrite: false`, so it's in the same sorted queue, and it
  passes through most objects (near-coincident centres). It's not in the
  `objects` array so `computeNestingRenderOrders` never touches it - without the
  fixed order, paint order flipped as the camera orbited (sometimes the object
  blends over the axis correctly, sometimes the axis draws on top). `-100` pins
  the axis to always draw first, so objects consistently blend over it.
- **FadedGrid**: `renderOrder={-1}`, same reason.

## BoundingBoxRoom edge culling

`BackSide` walls cull the near ones automatically. An edge is hidden only when
**both** faces it borders are culled - if just one side is open, the edge is
still the visible rim of the other wall. `openFaces` marks a face open when the
camera is beyond its plane.

## Gotcha a refactor would reintroduce

### axis-shaft-radius-ceiling

`AXIS_SHAFT_RADIUS` (0.022) is kept under 0.0272 (the thinnest cylinder-based
line glyph radius) so a coincident axis-aligned line still wins the depth test
against the axis shaft (#43). See also
[glyph-sizing.md](glyph-sizing.md#axis-vs-line-radius).
