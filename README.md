# GEOSCRATCH
## ⭐Overview
GeoScratch is a block-based visual programming tool for learning 3D geometry and linear algebra. It pairs Blockly's drag-and-drop editor with Three.js rendering, so snapping together concept-blocks (vectors, transforms, distances, solids) builds a live 3D scene.

## ⭐Pages
- **Landing** (`/landing`) — entry page.
- **Sandbox** (`/sandbox`) — free-form workspace for building any scene with blocks.
- **Exercise** (`/exercise`) — guided, graded exercises (transforms, distances, spheres, etc.).
- **Settings** (`/settings`) — display/theme preferences.

## ⭐Set up
This project uses **pnpm** (enforced via a `preinstall` check — `npm install` will fail).

1) Clone
```bash
git clone https://github.com/liqinshen9/GeoScratch.git
```

2) Install dependencies
```bash
pnpm install
```

3) Run the dev server
```bash
pnpm dev
```

Other available scripts:
```bash
pnpm build       # production build
pnpm preview     # preview the production build
pnpm lint        # eslint
pnpm test        # run tests once (vitest)
pnpm test:watch  # run tests in watch mode
```

## ⭐Tech Stack
React 19 + Vite 7, Blockly 12 (block editor), Three.js (3D rendering), Zustand (state), React Router, Tailwind CSS 4.

## ⭐Architecture Overview
![image alt](https://github.com/winola-whu/GeoScratch/blob/df920a902a9297827534a3f5303a8a299529b9bf/Screenshot%202025-10-25%20164246.png)

We recommend using **Visual Studio Code (VS Code)** for development and debugging.

## ⭐Design 
![image alt](https://github.com/winola-whu/GeoScratch/blob/c15fb9d93a509c56216e73aff8c0aea6549cebe3/Block%20Design.png)  

Blocks encode vector ops, line/plane forms, transforms, and solids—each block maps 1-to-1 to a concept. This lets learners build scenes by snapping together concept-blocks instead of writing formulas.

