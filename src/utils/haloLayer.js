// Layer channel reserved for halo "inflated companion" meshes (see
// docs/halos-epic-plan.md). Shared between HaloDepthPrepass.jsx (which
// renders only this layer into its offscreen target) and the sandboxed
// generated-code context (block definition functions, which read it via
// window.HALO_LAYER -- see generateAndRun.js) that builds companion meshes.
export const HALO_LAYER = 1
