# Blockly integration notes

Assorted Blockly-specific knowledge. See also
[naming-registry.md](naming-registry.md) (block.data, undo groups),
[selection-and-picking.md](selection-and-picking.md) (FocusManager fallout), and
`CLAUDE.md` (adding a block).

## The variable wrapper's block layout

`blocks/geometricVariables/variableWrapper.js`. `geo_variable` is a pass-through
wrapper: plug any Point/Vector/Line/Sphere/Scalar/compute-result into it and it
behaves exactly as that block did (same output, same graph position, same
rendering), while also publishing the value under its own refId so
`geo_variable_ref` blocks elsewhere read the **same** value back with no
duplicate 3D object and no re-evaluation. Pairing is by refId, not block id (see
[naming-registry.md](naming-registry.md#the-variable-wrapper)).

Its layout mirrors `transform_pipeline`: a title row, the socket row, then a
right-aligned control row, so the body carries on below and around whatever is
plugged in rather than hugging it.

- **No spacer row.** The pipeline needs one to give its statement carve a floor;
  here the button row is already that floor, and a spacer on top of it just
  leaves dead space under a tall wrapped block.
- **Inline input, not external.** The pipeline gets its enclosure from
  `appendStatementInput`, which is unavailable here (the wrapped blocks are
  _value_ blocks). The value-input equivalent is an **inline** input: Blockly
  draws it as a puzzle hole in the body with the child rendered inside the
  parent's outline, whereas an external input hangs the child off the right edge
  entirely. Inline inputs also merge consecutive inputs onto one row, so each
  row is closed explicitly with `appendEndRowInput()`.
- **Multi-type output.** Both `geo_variable` and `geo_variable_ref` set
  `setOutput(true, VALUE_TYPES)`. Blockly accepts a connection when the two
  check arrays intersect, so one reference block plugs into `vector3`, `obj3D`
  and `scalar` sockets alike.

`spawnReferenceFor` collapses the new reference block **before** the open-spot
search measures it, so placement uses the small collapsed footprint.

## My Block duplicate detection (blocklyXml.js)

`canonicalizeWorkspaceXml` produces a comparable fingerprint: two XML texts
describing the same blocks produce the same string regardless of ids or
positions (`id`/`x`/`y` are ignored). Only **top-level** blocks are sorted -
they have no inherent order in a workspace, whereas inner input/field order is
meaningful. Returns `''` on malformed XML, which callers treat as "cannot tell",
not "duplicate".

## Autosave restore (useWorkspaceAutosave.js)

- The workspace must be fully injected (`workspace.rendered`) before loading
  blocks - otherwise "Cannot create a rendered block in a headless workspace".
- `Blockly.Events.disable()` around the restore load, so it doesn't trigger the
  save listener and echo straight back to the store.
- Restore reads through `getState()`, not a subscription, so the component
  doesn't re-render on every block move.
- The `rendered` check is repeated inside the change-listener frame: the
  workspace can be disposed between an event firing and that frame running.

## Event filtering (blocklyEventFilters.js)

`blockMoveChangesGeneratedCode` distinguishes a re-parent (changes generated
code, so re-run) from a drag-pixel `BLOCK_MOVE` (position only). Used by the
naming registry and `shouldIgnoreWorkspaceChange`.
