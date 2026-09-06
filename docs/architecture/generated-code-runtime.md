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
`HALO_MAX_IMMUNE_IDS`), `buildVectorShaftGlyph`, `makeStagedVectorReveal`.

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

### rebuild-hook-lives-in-generateandrun

`window.__geoScratchRebuildTransformedLine` is set in `generateAndRun.js`, not
here, because it's defined there and `sceneRuntime.js` must not import
`generateAndRun.js` back (cycle).
