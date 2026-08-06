# Halo epic (#44, sub-issues #45/#46) -- GPU depth-trick approach

## Context

This replaces two earlier drafts of this plan. First draft: an `OutlinePass`/`EffectComposer` glow-outline around a whole object -- wrong technique entirely, not a halo. Second draft: a CPU-side screen-space crossing detector that punched literal gaps into a line's geometry, rebuilt every frame. That one got the *technique* right (haloed lines: a gap in the farther of two crossing lines, sized to read clearly) but the *architecture* wrong -- rebuilding real geometry every frame fought the existing `ZoomInvariantScaler`/`DashZoomSync` machinery (a same-priority race caused the far line to lose its zoom-invariant sizing), and independently left the gap's position looking wrong/laggy during active orbiting. Two rounds of patching that architecture surfaced two different bugs from the same root cause -- rebuilding mutable geometry every frame is fragile by nature -- so rather than patch a third time, this plan switches to a GPU depth-trick: the crossing/occlusion resolution happens per-pixel in the existing render pipeline, every frame, for free, with no CPU pairwise math and no rebuilt geometry.

## The technique, GPU version

Classic haloed-line rendering, implemented via depth buffer trickery instead of explicit gap geometry:

1. Every haloable line/vector gets a second, **inflated** companion mesh (same shape, bigger radius) alongside its real one. Built once at construction time, same as the real geometry -- no per-frame rebuild.
2. Before the normal color pass, render just the inflated companions -- depth only, no visible color -- into an offscreen target, encoding a small integer **halo ID** per object into a second channel (self-occlusion guard, see below).
3. Render the scene normally, but haloable objects' materials gain an extra fragment-shader check: sample the offscreen target at this pixel; if a *different* object's inflated footprint is nearer than this fragment's own depth, discard it.

Where a nearer line's inflated footprint overlaps a farther line, the farther line's fragments there get discarded -- a gap, computed by the GPU's own per-pixel depth test, correct every frame automatically as the camera moves, with no explicit "where do these two lines cross" math at all.

## Why this avoids the CPU approach's bug family

- **No rebuild-vs-ZoomInvariantScaler race.** The inflated companion mesh is static geometry, tagged with the same `userData.zoomInvariantRadius` the real tube already uses -- `ZoomInvariantScaler` scales it exactly like every other zoom-invariant mesh in the scene, via the SAME already-correct, already-tested mechanism. No new per-frame rebuild path to race against it.
- **No position lag/staleness.** There's no CPU-computed "crossing point" to go stale between frames -- the GPU depth test re-evaluates every pixel, every frame, using whatever the current camera actually is.
- **No pairwise math at all.** Occlusion resolution is a property of the render pipeline (depth test), not an explicit O(n^2) screen-space intersection test over line pairs.

## Self-occlusion problem and its fix

A line's own inflated silhouette can be nearer than its own real surface at grazing/edge pixels (a wider cylinder's near-surface bulges toward the camera more than the thin one's, right at the edge) -- naively, every line would falsely gap itself at its silhouette. Fixed by comparing **object identity**, not just depth: the offscreen pass also writes a small integer ID per object (which haloable object owns the nearest inflated surface at this pixel), and the main pass's discard check only fires when the ID differs from the fragment's own object. A fixed epsilon-depth-tolerance approach (no ID) was considered and rejected -- it's scene-scale-dependent and doesn't structurally rule out false self-discard the way ID comparison does.

## Scope

Same as before: line x line, line x vector, vector x vector. Points, axes, and near-coincident/parallel pairs excluded (same reasoning as the earlier draft -- a point never needs gapping, and a coincident pair has no single crossing point, it's the jitter fix's job).

**Narrower than before on render style**: initial implementation targets `plain_tube` only (the default style, real `MeshStandardMaterial` cylinder). `illuminated_line` (custom `ShaderMaterial`), `ringed_tube` (textured `MeshStandardMaterial`), and the thin/fat line styles (`LineBasicMaterial`/`LineMaterial`, which have no real radius to inflate the same way) each need their own `onBeforeCompile` discard-chunk injection, added incrementally -- doing all styles at once in a not-yet-proven pipeline repeats the "boil the ocean before validating the core mechanism" mistake from the first HaloComposer attempt.

## Files (planned, not yet built)

**New:**
- `src/utils/haloIdRegistry.js` -- assigns/recycles small integer IDs to haloable objects (line/vector `userData.geoType` in the eligible set), exposed as `userData.haloId`. Simple incrementing counter with a free-list, rebuilt on scene regeneration.
- `src/components/Scene3D/HaloDepthPrepass.jsx` -- owns the offscreen `WebGLRenderTarget` (depth + ID), a minimal `ShaderMaterial` (vertex: standard MVP on the inflated geometry; fragment: write `vec4(haloId / 255.0, 0, 0, 1)`, depth via standard depth write), and the render call itself: set `camera.layers.mask` to the halo-companion layer only, `renderer.setRenderTarget(target)`, render, restore. Runs once per frame, before the main pass -- needs its own frame priority ordering, TBD during implementation (likely still needs `-1`-style priority relative to `ZoomInvariantScaler`, but for a different reason: the target must be populated before the main pass's fragment shader samples it, not because of a rebuild race).
- Inflated companion mesh construction -- lives alongside each real tube's construction in `geoVectorLine.js` (`plain_tube` style first): same `CylinderGeometry`, radius = real radius + halo margin, `userData.zoomInvariantRadius` set the same way the real tube's is, assigned to a dedicated `THREE.Layers` channel so it never renders in the normal color pass, only into `HaloDepthPrepass`'s target.

**Modify:**
- `geoVectorLine.js`'s `plain_tube` cylinder material -- needs an `onBeforeCompile` fragment-shader injection: sample the halo depth/ID target at `gl_FragCoord.xy`, compare depth and ID, `discard` if occluded by a different object's inflated footprint. Needs the halo target's texture + this object's own `haloId` as uniforms.
- `Scene3D.jsx` -- mount `<HaloDepthPrepass>` inside `<Canvas>`.

## Open implementation questions to resolve while building (not yet answered)

- **Screen-space UV for sampling the target in the main pass.** Standard approach: divide `gl_FragCoord.xy` by the render target's resolution (needs a `resolution` uniform, kept in sync with canvas size the same way `FatLineSync` already keeps `LineMaterial.resolution` in sync).
- **Depth comparison precision/format.** Whether to read hardware depth (`gl_FragCoord.z` semantics, needs a depth *texture* attachment, not just a renderbuffer) or write a custom linear-depth value into a color channel alongside the ID (simpler to reason about across perspective projection, avoids needing `WEBGL_depth_texture`-style attachment wrangling). Leaning toward the latter for simplicity, to be confirmed once prototyping starts.
- **ID encoding precision.** `id / 255.0` in an 8-bit channel caps at 255 distinct haloable objects and risks rounding at the boundary between adjacent IDs -- may need a 16-bit float target or a dedicated integer texture format instead, TBD based on what three.js's `WebGLRenderTarget` supports cleanly for this three.js version.
- **Inflated-mesh layer wiring in R3F.** Confirm the cleanest way to keep a companion mesh out of the default camera's render but visible to a second manually-triggered render call -- likely `object.layers.set(N)` + toggling `camera.layers` around the prepass render, needs a throwaway test before relying on it for real (same "verify the risky unknown first" discipline as the original plan's GizmoHelper caution).

## Manual verification (once built)

Same crossing scenarios as before (line x line at various depths/angles, near/far swap, no-crossing baseline), PLUS the two specific regressions from the CPU approach that motivated this rewrite:
1. **Zoom test**: gapped line's radius must track `ZoomInvariantScaler` identically to an un-gapped line at every zoom level, not just incidentally at one distance.
2. **Continuous-orbit test**: gap position must track smoothly as the camera moves, with no per-frame staleness or jitter, verified by watching (not just computing) an active drag.
