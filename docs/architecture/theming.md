# App theme (light / dark)

`store/themeConfig.js`, `store/useSettingsStore.js`, `hooks/useThemeSync.js`,
`index.css`, plus per-surface hooks in `Scene3D/` and `BlocksCanvas/`.

One switch flips the whole app: chrome, pages, the Blockly workspace and blocks,
and the 3D scene (background, grid, room, axes, labels, and per-instance object
colors).

## The setting and how it resolves

`settings.theme` is one of `light | dark | system` (`THEMES` in
`themeConfig.js`), default `light`. The header button is a plain light/dark
switch; `system` (follow the OS) is an opt-in choice from Settings. The theme is
saved alongside the other user settings in `localStorage['geoscratch:user-settings']`.
The earlier `geoscratch:theme` preference is read as a fallback and kept in sync
as a pre-paint cache. The combined settings take precedence. `resetSettings()`
restores all settings, including the theme, to their defaults.

`resolveTheme(theme, prefersDark)` collapses that to the concrete scheme to
paint: `'light'` or `'dark'`. `system` follows
`matchMedia('(prefers-color-scheme: dark)')`.

The resolved value lives in two places, kept in step by `useThemeSync()`
(mounted once in `layout/Layout.jsx`):

1. `document.documentElement[data-theme]` -- drives all CSS.
2. `useSettingsStore` state `resolvedTheme` -- so **non-React** code (the
   generated-code runtime, `colorSystem.js`, `Workspace.jsx`) can read the
   scheme synchronously off the store.

Blockly's own theming is only used for block colours and the marker/insertion
colours (via `workspace.setTheme(getBlockTheme(mode))`). Everything else about
the workspace surface is driven by CSS tokens so it tracks `data-theme` live and
can't get stuck on a value baked in when the workspace was injected under a
different theme (a real bug we hit repeatedly):

- **background** -- `#blocks-canvas .workspace-host .blocklySvg { background-color:
  var(--geo-workspace) !important }`. Blockly fills `blocklyMainBackground` with
  the grid pattern (transparent between dots), so this SVG colour behind it is
  what shows. A solid fill on `blocklyMainBackground` itself would paint over the
  dots. `workspaceBackgroundColour` is deliberately absent from the Blockly theme.
- **dot grid** -- `#blocks-canvas [id^='blocklyGridPattern'] line { stroke:
  var(--workspace-grid-colour) !important }`. Blockly names the grid `<pattern>`
  by id (no class) and writes `grid.colour` as an inline stroke on its `<line>`
  children; this overrides it.
- **flyout** -- the pre-existing `.blocklyFlyoutBackground { fill: var(--geo-surface) }`.

`index.html` has a tiny inline script that sets `data-theme` before first paint
from the same `localStorage` key, so a dark reload doesn't flash white.
`useThemeSync` takes over once React runs.

## CSS

`index.css` defines the light palette on bare `:root` and overrides every token
under `:root[data-theme='dark']`. Components style against tokens
(`--geo-surface`, `--geo-text`, `--geo-border`, the shadcn `--background` etc.),
plus a few theme-specific groups added for dark mode:

- `--geo-tint-weak / -medium / -ring` -- brand-blue-over-surface overlays that
  become a light tint on dark.
- `--state-pass-* / -fail-* / -warn-*` -- exercise pass/fail and difficulty
  pills (previously hardcoded greens/reds/ambers all over the page CSS).
- `--scene-overlay-* / --scene-label-*` -- the 3D-view buttons and label pills.
- `--nav-bg` -- the top nav / landing swoop (a deep blue in both themes, not the
  bright accent).

Where a rule genuinely needs a per-theme value with no matching token, the file
carries a `:root[data-theme='dark'] .selector { ... }` override block near the
bottom (see `SettingsPage.css`, `BlocksCanvas.css`). `LandingPage.css` keeps its
local `--bg-main` brand-yellow look and gets a dark override on `.landing-page`.

## 3D scene

Scene chrome has no store subscriber -- it re-renders from the resolved theme
read via `useResolvedTheme()` in `Scene3D.jsx` and threaded down as a `theme`
prop:

- `Scene3D.jsx` -- canvas `<color attach="background">`, ambient/point light
  intensities, and the `GizmoViewport` label colour.
- `sceneConstants.js` -- `getAxisColors(theme)` / `getTickColor(theme)` (the old
  `AXIS_COLORS` / `DESMOS_TICK_COLOR` exports remain as the light values).
- `SceneFurniture.jsx` -- `FadedGrid` (keyed on `theme` so it rebuilds), the
  `BoundingBoxRoom` wall + edge materials, and `Axes` (arrow / tick / origin
  colours).

## Object + block instance colours

Each preset in `colorPresets.js` has an optional `dark` sub-object
(`{ types, roles }`) with lifted tone ranges. `colorSystem.js`'s `activePreset()`
returns `{ label, ...preset.dark }` when the store's `resolvedTheme` is `dark`,
so `forInstance` / `forRole` transparently produce dark-appropriate colours.

`subscribeToPreset` fires on a change to **either** `colorPreset` or
`resolvedTheme`. That drives:

- every placed block, via the recolor loop in `hooks/useBlocksWorkspace.js`;
- the flat non-object block styles (transform pipeline/steps, matrix, variables)
  and Blockly component styles, via a second effect there that calls
  `workspace.setTheme(getBlockTheme(mode))`;
- flyout previews (`BlockPalette.jsx`, keyed on `resolvedTheme`);
- the 3D objects, whose builders already listen to any settings change.

Texture-baked glyph details (ringed tube, `dark_texture` collision, vector ring
accents) only refresh on the next scene rebuild -- same as a plain colour-preset
switch.

## Exercises

`settingsOverrides` can lock `theme` like any other setting; the Settings and
header controls render as disabled while such an exercise is open.
