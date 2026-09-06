# Architecture notes

Long-form subsystem rationale that used to live as multi-paragraph comments in
the source. Each source file that had such a comment now carries a one-line
pointer to the relevant section here. `CLAUDE.md` stays the short "what bites
you" summary; this is the depth.

| Doc                                                            | Covers                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [generated-code-runtime.md](generated-code-runtime.md)         | Why the runtime API is on `window`, `sceneRuntime.js`, the `.toString()` builder model, `geoVarStore` / `geoVar` fallbacks, the "scene just doesn't appear" failure mode                   |
| [halos.md](halos.md)                                           | The GPU depth-trick haloed-line rendering: prepass -> dilate -> discard, ID registry, exact-touch immunity, and the shader gotchas                                                         |
| [vector-line-glyphs.md](vector-line-glyphs.md)                 | `geoVectorLineDefinition`: line-vs-box clip, dash machinery, the three line styles, ring texture + needle-triangle bug, collision accents, `userData` contract; plus `vectorShaftGlyph.js` |
| [glyph-sizing.md](glyph-sizing.md)                             | Zoom-invariant scale, `ZoomInvariantScaler` / `DashZoomSync` / `FatLineSync`, per-glyph-kind multipliers, axis-vs-line radius                                                              |
| [label-declutter.md](label-declutter.md)                       | The mass-spring label declutter model and every tuning-constant that can't move much                                                                                                       |
| [collision.md](collision.md)                                   | `tubeCollision.js`: per-collider strategy (sphere / plane / box), the exact box-tube zone search, world-space transforms                                                                   |
| [selection-and-picking.md](selection-and-picking.md)           | Two-way block<->object selection, `ScenePicker` click-vs-drag (#92), `SelectionHighlight` blink/glow, the trash hook                                                                       |
| [transform-and-line-rebuild.md](transform-and-line-rebuild.md) | #77: why a transformed line is rebuilt not `applyMatrix4`'d, `runConnectedTransformPipelines`, the per-frame line matrix map                                                               |
| [animation.md](animation.md)                                   | #38: the `userData.animate(p, ease)` opt-in protocol, `AnimationDriver`, pose-pair baking, staged vector reveal                                                                            |
| [render-order.md](render-order.md)                             | #29: the transparent-sort flicker bug class, `computeNestingRenderOrders`, axis / grid fixed `renderOrder`                                                                                 |
| [naming-registry.md](naming-registry.md)                       | `namingRegistry.js` assign-once names, the variable wrapper / refId pairing, variable-ordering warnings, collapse-to-reference                                                             |
| [color-system.md](color-system.md)                             | The HCT object-color system: per-type families, deterministic per-instance colors, roles, presets                                                                                          |
| [blockly-integration.md](blockly-integration.md)               | The variable wrapper's block layout, My Block duplicate detection, autosave restore, event filtering                                                                                       |

## Recurring bug classes

Documented because a plausible-looking simplification reintroduces them:

- **Transparent render order** (#29) - [render-order.md](render-order.md).
  Nested / coincident-centre transparent objects flicker under three's
  distance sort; the fix is always a fixed `renderOrder`.
- **Line rebuild on transform** (#77) -
  [transform-and-line-rebuild.md](transform-and-line-rebuild.md#the-77-problem).
  A line's extent is baked into geometry; `applyMatrix4` leaves it
  wall-to-wall wrong.
- **Label declutter force continuity** -
  [label-declutter.md](label-declutter.md#repulsion-continuity). Any repulsion
  force that isn't exactly 0 at the overlap boundary oscillates forever.
- **Needle-triangle UV interpolation** -
  [vector-line-glyphs.md](vector-line-glyphs.md#needle-triangle). A cylinder
  spanning the whole scene with one height segment breaks texture
  interpolation on some GPUs; the fix is height segments, not ring count.
- **GPU resource leaks on rebuild** -
  [vector-line-glyphs.md](vector-line-glyphs.md#dispose-on-rebuild). `.remove()`
  doesn't free GPU buffers; a fast zoom that rebuilds glyphs many times a
  second exhausts them.
