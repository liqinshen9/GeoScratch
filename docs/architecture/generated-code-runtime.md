# The generated-code runtime

`utils/sceneRuntime.js`, `utils/generateAndRun.js`, `utils/runAndSync.js`,
`utils/setupChangeListener.js`. See also the render-pipeline summary and "the
one rule that will bite you" in `CLAUDE.md`.

## Why the runtime API is on `window`

A block's builder function (`geoVectorLineDefinition`, `geoCubeDefinition`, ...)
is serialised with `.toString()` by its code generator and evaluated inside a
`new Function(...)` in `generateAndRun.js`. The resulting function body has **no
module scope**: every `import` at the top of the file it was written in is
invisible to it at runtime.

So a builder must reach everything through the names `installSceneRuntime`
publishes on `window`. Writing `import * as THREE from 'three'` in a block file
and using it inside a builder compiles fine, passes lint, and then throws `THREE
is not defined` at runtime.

`sceneRuntime.js` is the single list of what a builder may assume exists. If you
need something new inside a builder, **add it there rather than importing it**.
`sceneRuntime.test.js` pins the surface.

## The surface

`window.THREE`, `window.threeObjStore` (blockId -> Object3D, what gets
rendered), `window.vectorNotation`, `window.geoNaming`, `window.geoVarStore` /
`geoSetVar` / `geoVar`, the halo surface (`HALO_LAYER`, `getHaloId`,
`applyHaloDiscardMaterial`, `createHaloIdMaterial`, `registerHaloLine`,
`HALO_MAX_IMMUNE_IDS`), `buildVectorShaftGlyph`, `makeStagedVectorReveal`,
`geoPointMarker` / `geoPointMaterial`, `geoIsLiveObject`.

A subset (`THREE`, `threeObjStore`, `createInfinitePlaneMesh`,
`vectorNotation`, `geoNaming`, `geoSetVar`, `geoVar`) is **also** passed
positionally to the generated function (`RUNTIME_PARAM_NAMES`), so top-level
generated statements can use them as bare identifiers; a stringified builder
body, being a nested function, sees them too. Everything else is
`window.`-qualified at the use site.

Most of the surface is rebuilt per run, matching "the whole scene regenerates on
every workspace edit". `window.geoNaming` is the exception - a thin view over
`namingRegistry.js`, which assigns names once at block-creation time, so a block
reports the same name regardless of run order.

## Gotchas a refactor would reintroduce

### varstore-not-threeobjstore

`geoVarStore` is deliberately **not** `threeObjStore`: `runAndSync.js` renders
`Object.values(threeObjStore)`, so a bare `Vector3` or number in there would be
handed to Scene3D as a scene object. Keyed by the wrapper block's refId.

### geovar-fallback

`geoVar(key, fallback)` returns a type-appropriate fallback for a dangling or
mis-ordered reference. Returning `undefined` into e.g. a vector's "from point:"
input throws, and `generateAndRun`'s catch swallows it - silently blanking the
**entire** scene. A fallback degrades to one wrong value instead.

### failure-mode

`generateAndRun`'s catch logs but does not rethrow - one malformed block should
degrade to a partial scene, not take the editor down. But it MUST be loud: a
silent failure looks identical to "the scene is just empty", and the most common
cause is a builder referencing an imported binding from inside its stringified
body. The console line is `[GeoScratch] Generated block code threw`.

### stale-check-walks-ancestors

A builder that subscribes to settings beside the object it made (edge lines,
gridlines, glyph style) has to drop that subscription once the object is stale,
and the obvious test -- `threeObjStore[blockId] === mine` -- is wrong. A wrapper
block (`geo_object_with_point`, `geo_show_point_on_object`) registers its group
under its own block id and deletes the child's entry, so a nested object reads
as stale while it is still on screen: it unsubscribes on the first settings
change and then never tracks that setting again. A cube inside "Object with
Point" keeps its outline edges after the toggle goes off, until an unrelated
workspace edit rebuilds the scene. `window.geoIsLiveObject(obj)`
(`utils/liveSceneObject.js`) is the test: walk `obj` and its ancestors and ask
whether any of them is in the store.

### rebuild-hook-lives-in-generateandrun

`window.__geoScratchRebuildTransformedLine` is set in `generateAndRun.js`, not
here, because it's defined there and `sceneRuntime.js` must not import
`generateAndRun.js` back (cycle).
