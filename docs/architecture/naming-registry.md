# Naming registry

`utils/namingRegistry.js` - the single source of truth for "what is this object
called". Related: `utils/variableReference.js`,
`utils/validateVariableOrdering.js`, `blocks/naming/Field*.js`,
`blocks/geometricVariables/variableWrapper.js`.

## What it replaced

Two previously-disconnected systems: `vectorNotation.js`'s ephemeral,
run-order-dependent `L1/P/v/Q1` counters (only ever reached generated runtime
code, never the block) and `blockReferenceLabels.js`'s separate collapse-only
`Line1/Sphere1/a-z` alias system. Now the block's face (`FieldObjectName`), the
3D-scene label, and the collapse-to-reference bubble all read one name from
here.

## Assign-once semantics

A number is assigned **once**, when a block is created (a `BLOCK_CREATE`
listener), never recomputed from code-generation order - so deleting an earlier
object never renumbers a later one. Numbers are monotonic per kind per
workspace and never reused.

The record is persisted on `block.data` under the namespaced key
`geoScratchNaming`, so a block carries exactly one naming record that survives
save/reload.

Per-workspace counters are rehydrated from the **max already-persisted number**
per kind (`refreshNamingCounters`), never a separately persisted value, so
there's nothing to get out of sync on load.

## The variable wrapper

`geo_variable` is configured with `adoptsNameFromInput: 'VALUE'` - it mirrors
the name of whatever is plugged into it (wrapping `Line1` makes its references
read `Line1`), falling back to its own auto name while empty or wrapping
something anonymous. `getDisplayName` keys off this; `ownsDisplayName` returns
false for an adopting wrapper so it never counts as a collision against the
block it borrows from.

Variable references pair with their wrapper by **refId**, not block id: refId
survives `addCompositeBlockToWorkspace` (strips id attributes, leaves `<data>`),
and a duplicated wrapper gets a fresh refId so it can't hijack the original's
references.

## Subscriptions

Keyed flat by `blockId` (unique within a running app), so callers don't thread
the owning workspace through to subscribe. `notifyBlockNameChanged` also fires
globally because a variable reference displays a _different_ block's name and
can't subscribe to one fixed id - it listens globally and re-resolves.

## Runtime accessor

`createRuntimeAccessor` is exposed as `window.geoNaming` by `generateAndRun.js`,
same pattern as `window.vectorNotation`.

## Gotchas a refactor would reintroduce

### no-setdata

`Blockly.Block` has no `setData()` - `data` is a plain property with no setter,
so writing it directly (as `blockReferenceLabels.js` used to) fires no event and
never reaches `setupChangeListener.js`'s auto-rerun. `writeBlockData` fires the
same `BlockChange('data', ...)` event Blockly's own field/comment/collapsed
setters fire, so a rename actually propagates to the 3D scene. Any code writing
`block.data` for naming or variable-reference payloads must go through this.

### create-only-conflict-resolution

`resolveConflicts` is set **only** from the `BLOCK_CREATE` path. Blockly's
Duplicate/paste copies `block.data` verbatim, so a copy arrives carrying the
original's record - detect it's already in use and reassign. A workspace
restored from saved XML must **not** go through conflict resolution: every block
there legitimately arrives with its own unique record and must keep it.

### copy-drops-custom-and-refid

A conflicted copy gets `custom: null` (two blocks called "Origin" is the exact
bug this fixes) and a fresh `refId` (variable references are keyed by refId; a
shared one lets a duplicated wrapper silently hijack the original's references).

### refresh-counters-on-eventless-restore

`refreshNamingCounters` is exported because a workspace can be populated with
events disabled (`BlocksCanvas.jsx`'s saved-XML restore), which bypasses the
`BLOCK_CREATE` listener and would leave counters at zero - the next new block
would then collide with a restored one.

### undo-group-join

The rename assignment joins the originating `BLOCK_CREATE` event's undo group.
Blockly delivers `BLOCK_CREATE` asynchronously, so without this the rename lands
in its own group and one Ctrl+Z reverts only the rename (the duplicate visibly
snapping back to the original's name) instead of removing the duplicate.

### dual-style-free-check

A number is only safe if it's free in **both** naming styles (`short` and
`descriptive`). A custom-named block can sit on `L3`, and the style is a live
setting that can flip at any time, so `nextFreeNumber` checks both renderings.
`isRecordTaken` also checks `{kind, number}` identity directly, because a
name-only check is style-sensitive.

### pooled-alias-not-nameable

`setCustomName` is not gated on `isNameable`: a pooled single-letter alias
(`blockReferenceLabels.js`'s "collapse to reference" on an anonymous
compute-result operand) is stored the same way as a real object's custom name -
purely as `custom` with no `kind`/`number` - so both share one uniqueness check
(`isNameTaken`) and can never collide.

## Variable references (variableReference.js)

`geo_variable_ref` blocks store which wrapper they point at under their own
`block.data` namespace (`geoScratchVarRef`), alongside the naming record.
`getRefTarget` / `setRefTarget` live in `variableReference.js` rather than
`variableWrapper.js` so lightweight utilities (`validateVariableOrdering.js`)
can read them without pulling in the whole block-definition / color-system
import chain.

### wrapper-code-evaluates-once

`wrapperCode` emits `geoSetVar(refId, inner)`. `geoSetVar` stores **and
returns** the value, so the wrapped expression is evaluated exactly once -
splicing it in twice would construct two separate objects (the lesson from
`setObj3D.js`).

### reference-fallback

A dangling or mis-ordered reference must not hand `undefined` to a consumer -
e.g. `linalg_vec3`'s "from point:" does `__anchor.clone()`, which throws and
(via `generateAndRun`'s catch) blanks the **entire** scene. `fallbackExpressionFor`
picks a type-appropriate fallback (`0` / `new THREE.Vector3()` / `null`) from
what the wrapper holds, else from the socket the reference is plugged into.

### missing-only-when-once-pointed

`referenceDisplayName` shows `(missing)` only when the reference actually
pointed somewhere once - a fresh reference (palette preview, or one dragged out
before being wired) has never had a target and shouldn't read as broken.

## Variable ordering warnings (validateVariableOrdering.js)

Blockly's `javascriptGenerator.workspaceToCode` emits top-level stacks in
`getTopBlocks(true)` order - sorted by **on-screen position**, not creation
order. A `get` block whose stack sits above its `set` block's stack is emitted
first and reads the variable before the `set` has run; this repo's generators
default the declaration to `undefined` rather than throwing, so it silently
reads a stale value. `validateVariableOrdering` flags that as a visible warning
on the offending `get` block, using the same mechanism
`runConnectedTransformPipelines` uses for its warnings, and the identical
`getTopBlocks(true)` ordering the real generator uses.

Granularity is per top-level **stack**, not statement-by-statement - enough to
catch "used it in an earlier stack"; a get/set pair in the wrong sub-order
within one stack isn't distinguished. True reordering is out of scope.

`describeBlock` gives one "writes a value" / "reads one" description covering
both the typed set/get pairs and the wrapper + its references, so the ordering
logic is written once.

## Collapse to reference (blockReferenceLabels.js)

"Collapse to reference" shrinks a block to a small labeled puck. Naming is
delegated entirely to `namingRegistry.js`: an already-nameable block
(`geo_vector`, `geo_sphere`, ...) has a real name from creation, so collapsing
just displays it; a plain compute-result operand
(`vector_arithmetic`, `scalar_arithmetic`, ...) collapsed as a nested input has
no name of its own, so it's given a pooled single-letter alias (`a-z`, then
`r1`, `r2`, ...) the first time. Both kinds live in the same registry storage so
they can never collide and render identically everywhere.

### collapsed-label-baked-once

Blockly bakes `toString()` into a `FieldLabel` once, when the block is
collapsed - a later rename leaves the old name on the puck. `refreshCollapsedLabel`
re-pushes it. This was a pre-existing bug for any collapsed object, not just
variable references.

### tostring-patch-resolves-reference

The `Blockly.Block.prototype.toString` patch resolves a `geo_variable_ref` to
its wrapper's name **here** rather than falling through, because Blockly's
default `toString` on a collapsed block renders the collapsed label itself - so
refreshing that label from `toString()` would just rewrite the stale text.
