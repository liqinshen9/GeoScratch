# Shadows

Two lights cast: a fixed overhead point light and the camera-following headlight
(`Scene3D/HeadLight.jsx`). `SceneFurniture.jsx`'s floor is the receiver that
makes any of it visible; `objectsReceiveShadows` decides whether scene objects
receive from each other as well.

Three settings, all in `useSettingsStore`:

| Setting                 | Effect                                                |
| ----------------------- | ----------------------------------------------------- |
| `pointShadowsEnabled`   | The overhead light casts                              |
| `cameraShadowsEnabled`  | The headlight casts                                   |
| `primitivesCastShadows` | Lines, vectors and points cast, not just solid bodies |

## Where the overhead light sits

`OVERHEAD_LIGHT_POSITION` in `Scene3D/sceneConstants.js`: above the scene and to
the viewer's left, as seen from the default camera. Its azimuth is the camera's
minus 90 degrees, so editing `DEFAULT_CAMERA_VIEW` keeps it on the left. It is
a fixed world position, computed once: orbiting the camera does not move it
(the headlight is the light that follows the camera).

The reason is the perceptual light-from-above prior. When shading is ambiguous,
people assume light comes from above, and the assumption is biased to the
left: about 26 degrees left of vertical on average (Sun & Perona 1998,
Mamassian & Goutcher 2001). Lighting that agrees with the prior makes shading
and shadows read as shape and depth more easily; lighting from the lower right
can make the same bumps read as dents. At 64 degrees elevation and 27 degrees
camera elevation, the light lands about 29 degrees left of screen vertical.

It has to stay inside the 40-unit bounding box (height under 20), or the box's
walls shadow the whole room.

Before this it sat at `[8, 18, 0]`, which from the default view is above and to
the right.

## Who casts

`castShadow` is set at build time on cube, sphere and teapot meshes only, so
before `primitivesCastShadows` existed the cast-shadow-as-spatial-anchor cue
never applied to the primitives it matters most for. That setting is applied
centrally, in the same `Scene3D` traverse that handles `receiveShadow`, rather
than in the ten or so operator blocks that build point markers.

Two exclusions in that traverse:

- **Solids** (`geo_cube`, `geo_sphere`, `geo_teapot`) opt in inside their own
  builders and keep casting whatever the primitive setting says.
- **`LineSegments2`** subclasses `Mesh`, so it passes an `isMesh` check, but it
  draws through `LineMaterial`, which has no depth variant. It cannot render
  into a shadow map at all, so `plain_line` never casts however the settings are
  configured.

## Primitives cast from the overhead light only

A thin tube lit by the headlight throws a long shadow that swings as the viewer
orbits and reads as a second primitive rather than as depth information. So
primitives cast from the fixed overhead light and never from the headlight.

three.js has no supported way to express that. `castShadow` is one boolean per
object, not per light, and the visibility test in `WebGLShadowMap` uses the
**main** camera's layers rather than the shadow camera's, so layers cannot
separate the two either.

What does work is `onBeforeShadow` / `onAfterShadow`, which bracket
`renderBufferDirect` exactly, once per object per light. `HeadLight.jsx` tags its
shadow camera with `userData.isHeadlightShadow`; the hooks in `Scene3D.jsx`
recognise that tag and set the geometry's draw range to zero vertices for that
one pass, restoring it immediately after. Nothing reaches the headlight's shadow
map, and the overhead pass is untouched.

The restore has to be unconditional on the saved value rather than on the
camera, since a geometry shared between objects would otherwise keep a zero
range after the object that zeroed it finishes drawing.

## Study conditions

Perceptual study conditions T6 and T7 are built on these settings: T6 is the
overhead light alone, T7 adds the headlight. Because primitives never cast from
the headlight, T7 differs from T6 only for solid bodies.

`objectsReceiveShadows` is off in the app's defaults and in every study
condition (since 2026-10-01): shadows land on the room, never on other objects.
`study/phase1/shadowVisibility.js` relies on that when it logs whether a
target's shadow could be seen.

## Room fill shading

The overhead light and the headlight can light two faces of the room almost
identically: from the default view the floor and the -z wall came out the same
tone, so their seam (running from the view's centre to its lower right,
parallel to the grid) vanished. The room's edge lines cannot carry a seam,
since they lie exactly on the walls and lose the depth test.

`BoundingBoxRoom` therefore shades each face as if lit by one more directional
light, `ROOM_FILL_DIRECTION`, baked into that face's colour (Lambert:
`1 - strength * (1 - n . L) / 2` for the face's inward normal `n`). It is not a
real light, so scene objects are lit exactly as before, which keeps the study
conditions unchanged. Matte faces shade the same from any viewpoint, so the
seams hold as the camera orbits. The direction's three components have clearly
different magnitudes, because the step between two neighbouring faces is
proportional to the difference of the two components they depend on: with two
near-equal components a pair of neighbouring walls would come out alike.
`ROOM_FILL_STRENGTH` is modest (0.15); tone mapping compresses these near-white
tones, so a stronger fill buys little.
