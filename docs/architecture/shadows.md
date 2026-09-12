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
