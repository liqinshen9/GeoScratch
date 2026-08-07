# Halo epic (#44, sub-issues #45/#46) -- GPU depth-trick approach

## Status

**Implemented and shipped for `plain_tube` line-x-line crossings** (commits
`db5383b`, `3a92b76`, `371c15d`). The other three line styles (`illuminated_line`,
`ringed_tube`, plain/fat hairline) and all vector glyphs (#46) still render
crossings with no halo treatment at all -- see "Remaining scope" below. #44/#45/#46
are still open on GitHub; only the `plain_tube` line-x-line slice of #45 is done.

## Context

This replaces two earlier drafts of this plan. First draft: an `OutlinePass`/`EffectComposer` glow-outline around a whole object -- wrong technique entirely, not a halo. Second draft: a CPU-side screen-space crossing detector that punched literal gaps into a line's geometry, rebuilt every frame. That one got the *technique* right (haloed lines: a gap in the farther of two crossing lines, sized to read clearly) but the *architecture* wrong -- rebuilding real geometry every frame fought the existing `ZoomInvariantScaler`/`DashZoomSync` machinery (a same-priority race caused the far line to lose its zoom-invariant sizing), and independently left the gap's position looking wrong/laggy during active orbiting. Two rounds of patching that architecture surfaced two different bugs from the same root cause -- rebuilding mutable geometry every frame is fragile by nature -- so rather than patch a third time, this plan switched to a GPU depth-trick: the crossing/occlusion resolution happens per-pixel in the existing render pipeline, every frame, for free, with no CPU pairwise math and no rebuilt geometry.

## The technique, as built

Classic haloed-line rendering, implemented via depth buffer trickery instead of explicit gap geometry:

1. Every haloable line gets a second, **inflated** companion mesh (same shape, radius + 0.01 world units), built once at construction time on a dedicated `HALO_LAYER` (`haloLayer.js`) so it never renders in the normal color pass. Tagged with `userData.zoomInvariantRadius` the same as the real tube, so `ZoomInvariantScaler` scales it in lockstep automatically.
2. `HaloDepthPrepass.jsx` renders just the `HALO_LAYER` companions into an offscreen target every frame (priority `-2`), full canvas resolution (`HALO_TARGET_SCALE = 1.0`) -- color channel R carries a per-object integer ID (`haloIdRegistry.js`, `id/255` in an unlit `ShaderMaterial`, `haloIdMaterial.js`), a `DepthTexture` attachment carries real hardware depth.
3. `HaloDilatePass.jsx` (priority `-1`) runs a fullscreen box-max filter (`haloDilateShader.js`, `KERNEL_RADIUS = 8` texels) over that raw target, keeping whichever sample is nearest the camera per output texel. This is what actually produces the margin, as a **constant screen-space pixel radius** (~8 canvas px) rather than a 3D-geometry-based one -- isotropic, doesn't elongate at shallow crossing angles the way the companion mesh's own (now deliberately tiny) inflation would alone.
4. Each real tube's material gets an `onBeforeCompile` injection (`haloDiscardShader.js`) that samples the dilated target at `gl_FragCoord.xy`, compares linear view-space depth (`perspectiveDepthToViewZ`, bias `0.01` world units) and object ID, and `discard`s the fragment if a *different* object's dilated footprint is genuinely nearer.
5. `HaloUniformSync.jsx` pushes the dilated target + camera near/far + the `haloEnabled` setting into every haloed material's uniforms every frame, decoupled from the (lazy, first-render-only) `onBeforeCompile` population timing.

Where a nearer line's inflated footprint overlaps a farther line, the farther line's fragments there get discarded -- a gap, computed by the GPU's own per-pixel depth test, correct every frame automatically as the camera moves, with no explicit "where do these two lines cross" math.

## Beyond the original plan: exact-touch immunity

Not in any earlier draft -- added after real-world testing surfaced that two lines built to genuinely *intersect* at one exact 3D point (not just cross in screen projection while depth-separated) still got a false halo gap there, since their surfaces are coincident right at that point and the depth test is noise.

- `lineIntersection.js`: exact closest-approach-of-two-infinite-lines math (`TOUCH_EPSILON = 1e-4`), run at **construction time**, not per-frame.
- `haloIntersectionRegistry.js`: as each line is built, checks it against every previously-registered line in the current scene generation; a genuine touch marks both lines mutually immune (`registerHaloLine`/`addImmunePartner`), stored as up to `MAX_IMMUNE_IDS = 4` partner IDs per line, wired into the discard shader as a `haloImmuneIds[4]` uniform that short-circuits the discard check entirely for that pair -- exact and safe, not a tolerance, because two distinct straight lines can only meet at one point (they're coplanar), so there's no other location the pair would legitimately need to occlude each other at.
- **Shipped bug, since fixed**: the registry originally passed the raw Blockly block-id *string* into the immune-id array instead of the numeric halo ID the shader compares against; the string silently coerced to `NaN` on GPU upload, so the immunity check never matched and genuinely-touching lines kept gapping. Fixed by converting through `getHaloId()` before storing.

## Also fixed post-launch

- **Pixelated gap edge on extra-thick tubes**: `HALO_TARGET_SCALE` was `0.5` (quarter-resolution offscreen target, required `NearestFilter` since the ID channel can't be blended) -- each texel upsampled to a 2x2 canvas-pixel block, visible as staircasing on anything wide enough for a texel-sized step to register. Fixed by moving to `1.0` (full resolution, texel:pixel exactly 1:1) with `KERNEL_RADIUS` doubled (4 -> 8) alongside it so the on-screen margin size is unchanged, only its sharpness.
- **Axis-aligned lines disappearing into the axis at close zoom** (#86, a regression of #43): the axis shaft's fixed `0.022` world-unit radius was only guaranteed thinner than a line glyph's radius *at scale 1* -- `ZoomInvariantScaler`'s `MIN_SCALE` clamp (`0.3`) could shrink a line well below that at close zoom. Fixed with `MIN_LINE_WORLD_RADIUS` (`Scene3D.jsx`), a floor on a line glyph's *effective* radius (`AXIS_SHAFT_RADIUS * 1.25`) applied after the zoom-invariant scale, so every line style stays visibly thicker than the axis at any zoom, not just the reference distance. **This appears to fully resolve #86, which is still open on GitHub -- worth confirming against the issue's repro and closing.**

## Remaining scope (not built)

- **Other line styles** (#45's line-x-vector half, and the 3/4 of line styles besides `plain_tube`): `illuminated_line` (custom `ShaderMaterial`, needs its own discard injection since it doesn't share `MeshStandardMaterial`'s chunk structure), `ringed_tube` (`MeshStandardMaterial` but textured -- discard wiring should be mechanically the same as `plain_tube`, just not done yet), and the hairline/fat-line styles (`LineBasicMaterial`/`LineMaterial`, which have no true radius to build an inflated companion around -- needs a different companion strategy, e.g. a thin invisible tube of a nominal radius). `applyHaloDiscardMaterial` is currently only ever called on `cylMat`/`dashedTubeMat` in `geoVectorLine.js`.
- **Vectors (#46), entirely untouched**: no halo wiring anywhere in `linalgPrimitives/vector3.js`'s `ArrowHelper`/sphere glyph, nor in `linalgOperators/vectorArithmetic.js`, `vectorCross.js`, `vectorNormalise.js`, `vectorProject.js`, or `dotProductVisualCodegen.js`. A vector crossing a line, or another vector, currently just z-fights/occludes normally with no gap. The detection/rendering infra (`haloIntersectionRegistry.js`, `haloDiscardShader.js`, the companion-mesh pattern) is reusable as-is -- this is wiring work, not new architecture.
- **Near-coincident/parallel vector pairs**: #46 flags this as "not yet confirmed whether it reproduces the pre-#21 z-fighting bug" -- unchecked.

## Manual verification (established this round)

- **Exact-touch test**: two lines built through the same point (e.g. both `Position (1,1,1)`, different directions) must show zero gap at any zoom/angle -- verified by dumping live shader-uniform state (`selfHaloId`/`haloImmuneIds`) via a real Blockly-XML-injection pipeline, not just screenshots, after the string-vs-numeric-ID bug above cost multiple rounds of visually-plausible-but-wrong fixes.
- **Zoom test**: gapped line's radius must track `ZoomInvariantScaler` identically to an un-gapped line at every zoom level.
- **Continuous-orbit test**: gap position must track smoothly as the camera moves, no per-frame staleness or jitter.
- **Edge-sharpness test**: an extra-thick tube's gap boundary should read as a clean curve, not a staircase, at close zoom.
