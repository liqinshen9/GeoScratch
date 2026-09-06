# Selection, picking, and trash

`components/Scene3D/ScenePicker.jsx`, `utils/scenePicking.js`,
`components/BlocksCanvas/hooks/useBlockSelectionSync.js`,
`components/Scene3D/SelectionHighlight.jsx`,
`components/BlocksCanvas/hooks/useBlockTrash.js`, `utils/sceneFocus.js`,
`utils/blockReferenceLabels.js`.

## Two-way selection

`useWorkspaceStore.selectedBlockId` is the single source of truth. The Blockly
outline and the 3D scene both read it, so clicking a 3D object highlights its
block and vice versa. **Selection is a persistent highlight, not DOM focus** -
most of the subtlety in `useBlockSelectionSync` comes from Blockly's own
selection being focus-backed.

Objects are matched to blocks by **`srcBlockId`**, which is stable across scene
rebuilds (uuid is not), so a selection survives a regen and re-attaches to the
fresh objects.

## ScenePicker

Owns all raw pointer routing on the canvas. It **never** calls
`stopPropagation` / `preventDefault` on pointerdown - OrbitControls listens on
the same element and must stay free to start a drag. Whether a gesture was a
click is decided on pointerup from how far/long the pointer moved
(`classifyGesture`: `CLICK_MAX_DIST` 4px, `CLICK_MAX_MS` 400ms), so a drag that
begins over a large plane still orbits instead of being swallowed (#92).

- left click -> select the hit object's block (empty space clears)
- right click -> toggle that object's scene labels (#75)

`scenePicking.js` is framework-free and unit-tested without a WebGL context.
`down.moved` is set during the drag, so a wander-and-return still counts as a
drag. `contextmenu` consults the kept `downRef` because its ordering relative to
pointerup is platform-dependent.

Pointer move/up listeners are on `window`, not the canvas: OrbitControls sets
pointer capture on the wrapper during a drag, so the canvas child would miss the
events.

## SelectionHighlight

Headless, mounted under `<Scene>`, same pattern as `ZoomInvariantScaler`. Two
styles (`settings.objectHighlightStyle`):

- **BLINK** (default): forces materials transparent and oscillates opacity
  `BLINK_MIN_OPACITY..1`. `tick()` always returns true (continuous pulse).
- **GLOW**: a real warm `PointLight` + soft radial haze sprites + a small
  emissive bump, while the object's own colour stays intact. Three sub-paths -
  plane (border glow), vector (amber head ring + shaft trail), bbox (default).
  `tick()` returns true **only** when it repositioned to follow a moving object,
  so an idle glow selection doesn't force the frameloop.

Sprites are cheap, lights are not - trailing/secondary glows pass
`withLight: false`. `depthTest: false` on a sprite stops a flat billboard
cutting hard against a cone it overlaps.

## Gotchas a refactor would reintroduce

### blink-plane-exception

A plane's own already-translucent materials keep their transparency under BLINK
(a plane is too big to read as a solid wall) - they pulse only from their own
opacity toward `opacity + BOOST`, capped, never past.

### hide-plane-edge-line

The GLOW plane path hides the plane's own edge line first. It's translucent and
sorts inconsistently against the glow, so it peeks through on one side or the
other as the camera moves; the glow provides its own border.

### stable-traversal-order

`collectVectorHeads` relies on a stable traversal order so `tick()` can zip the
current heads against the parts it built. It also reports per-head visibility -
an animated `vector_arithmetic` arrow toggles its group's `.visible` while it
grows, and its head glow blinks out with it.

### post-delete-focus-fallout

Removing the selected block's element from the DOM makes Blockly's
`FocusManager` transiently select then deselect a neighbour block a beat later,
outside the delete event's group. Without a guard, the SELECTED handler mirrors
that neighbour into the store and the trailing `SELECTED(null)` re-applies its
outline, leaving it stuck selected + 3D-highlighted (#102).
`selectionAfterDeleteRef` ignores SELECTED events until the next pointer
gesture, with a `SELECTION_AFTER_DELETE_GRACE_MS` (400ms) timeout backstop for
keyboard-only flows.

### selected-null-also-fires-on-blur

`SELECTED(null)` fires on a deliberate deselect **and** every time the selected
block merely loses DOM focus (e.g. clicking into the 3D view to orbit). Since
selection is a persistent highlight, the handler keeps it and re-applies the
outline Blockly's blur just removed. Deliberate deselect runs through
`handleWorkspaceClick` / the 3D empty click / `BLOCK_DELETE` instead.

### manage-outline-directly

Store -> workspace manages `addSelect()` / `removeSelect()` directly, not
`Blockly.common.setSelected()`: `block.select()` alone doesn't clear a
previously selected block or update `common.getSelected()` (focus-manager
backed), and `setSelected(null)` throws. Tracking the last-applied block lets it
clear the old and add the new without pulling keyboard focus out of the 3D
canvas.

### background-click-via-blockly-event

Clicking the workspace background (to close the flyout / deselect) goes through
Blockly's own `CLICK` event, not a document-level DOM listener - Blockly's
gesture handling swallows the raw mousedown before it bubbles out.

## Trash (useBlockTrash)

Drag-a-block-to-the-trash deletion + a panel of recently deleted blocks
(`MAX_RECENT_DELETED` 8 - an undo affordance, not a history). Installs its own
`BLOCK_DRAG`-only workspace listener to stay independent of the selection
listener.

### class-toggle-not-state

The open-lid visual is a class toggle, not React state: it fires on every
pointermove during a drag, and re-rendering the whole canvas at that rate would
stutter the drag.

### two-raf-frames

`scheduleTrashDelete` waits **two** animation frames, not one: the first lets
Blockly finish settling the dropped block, the second lets the open-lid class
paint before the block disappears.

### capture-phase-pointermove

Blockly reports no pointer position during a block drag, so trash hit-testing
rides a raw **capture-phase** `pointermove` on `window`.

### re-test-on-drop

`handleBlockDrag` re-tests trash intersection on drop as well as trusting the
tracked flag - a drag that ends without a final pointermove (a flick, or a
programmatic end) would otherwise miss.

### dropeffect-must-match

`handleDeletedBlockDragStart` sets `effectAllowed = 'copy'`, which must match the
`'copy'` `dropEffect` set in `handleWorkspaceDragOver`, or the drop is rejected.
