# GeoScratch

Block-based visual programming for 3D geometry and linear algebra. Blockly for
the block editor, Three.js (via React Three Fiber) for the scene.

See `README.md` for setup. This file covers the things the code does not say
about itself.

## Commands

```bash
pnpm dev            # dev server
pnpm test           # vitest, single run
pnpm lint           # eslint -- expected to exit 0
pnpm format         # prettier --write .
pnpm build          # production build; catches import errors the others miss
```

## The render pipeline

Every workspace edit rebuilds the entire scene. There is no incremental update
path.

```
Blockly workspace
  -> javascriptGenerator.workspaceToCode()        generated JS, as a STRING
  -> new Function(...runtimeArgs, code)           utils/generateAndRun.js
  -> window.threeObjStore                         blockId -> Object3D
  -> BlockRegistry.reconcile()                    utils/runAndSync.js
  -> Scene3D objects prop                         components/Scene3D/
```

`utils/setupChangeListener.js` debounces workspace events onto an animation
frame and drives the whole chain. `utils/runAndSync.js` clears
`window.threeObjStore` before each run, so an object only survives if the run
that follows re-creates it.

The canvas uses `frameloop="demand"`. It renders when React re-renders or when
OrbitControls moves. If you mutate an Object3D outside of a React render, call
`invalidate()` or the change will not appear until something else triggers a
frame.

## The one rule that will bite you

**A block builder function cannot use `import`s.**

A block's code generator serialises its builder with `.toString()` and splices
the source text into the generated program:

```js
// blocks/geometric/geoVectorLine.js
const code = `(${geoVectorLineDefinition.toString()})(${vecPos}, ${vecDir}, ...)`
```

That text is then evaluated inside `new Function(...)`, which has no module
scope. Every `import` at the top of the file the builder was written in is
invisible to it at runtime.

So builders reach everything through `window`: `window.THREE`,
`window.threeObjStore`, `window.GeoScratchColors`, `window.useSettingsStore`,
`window.geoNaming`. `utils/sceneRuntime.js` installs that whole surface and
documents it; `utils/sceneRuntime.test.js` pins it.

This fails in an unhelpful way. Adding a normal-looking import to a builder
compiles, passes lint, passes the tests, and then throws `X is not defined` at
runtime for that one block. `generateAndRun.js` catches it so the rest of the
scene survives, which means the symptom is "my object just doesn't appear".
Check the console: the catch logs `[GeoScratch] Generated block code threw`.

If a builder needs something new, add it to `installSceneRuntime` in
`utils/sceneRuntime.js`. Do not import it.

Only builder functions are affected. Everything else in a block file -- the
`Blockly.Blocks[...]` definition, the generator itself, field classes -- runs
as a normal module and imports normally.

## Adding a block

Four places, in order:

1. `components/BlocksCanvas/blocks/<category>/yourBlock.js` -- the builder, the
   `Blockly.Blocks` definition, and the `javascriptGenerator.forBlock` entry.
2. `components/BlocksCanvas/blocks/<category>/index.js` -- call its `init*`.
3. `components/BlocksCanvas/catalog/blockCatalog.js` -- to appear in the palette.
4. `components/BlocksCanvas/blocks/blockColours.js` -- style and object type.

Each block file guards its registration with a module-level `REGISTERED` flag,
because `defineBlocks()` runs on every workspace mount.

## Where things live

| Path                           | What                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `components/BlocksCanvas/`     | Blockly host and block definitions. `hooks/` holds autosave, trash, selection sync.                           |
| `components/Scene3D/`          | R3F canvas. `labels/` is the label layer and its declutter simulation; `sizing/` the per-frame glyph scaling. |
| `exercises/`                   | One module per exercise (checker + panels). `shared/` holds what they have in common.                         |
| `store/`                       | Zustand stores plus the colour / line / naming / animation config modules                                     |
| `utils/`                       | Pure logic and the generated-code runtime. Most tests live here.                                              |
| `pages/`, `layout/`, `router/` | Routing and page shells                                                                                       |
| `data/exercises.js`            | Exercise metadata for browsing and navigation                                                                 |

## Adding an exercise

Add an entry to `data/exercises.js` and a module in `src/exercises/`, then
register it in `src/exercises/index.js`. That index documents the module
contract; `src/exercises/exercises.test.js` fails if the two lists drift apart.

## Conventions

- `@/` aliases `src/`. Sibling imports within `blocks/<category>/` stay relative.
- Prettier owns formatting (`.prettierrc`): no semicolons, single quotes, 100
  columns. Run `pnpm format` before committing.
- Tests are colocated as `*.test.js` and cover pure logic in `utils/`. React
  components have no automated coverage -- verify those in the running app.
- Comments here explain _why_, often at length, and several document real bugs
  that a plausible-looking simplification would reintroduce (transparent render
  ordering, label declutter force continuity, per-segment zoom scaling). Read
  before you tidy.
