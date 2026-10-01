// Screenshots of the Phase 1 techniques for the Qualtrics questionnaires: the
// dev-only /study/showcase scene under every technique, then under the two
// holistic configurations (C1 baseline, C2 perception-driven). Also the two
// cue close-ups the Phase 1 intro shows; copy those into public/study/.
//
//   pnpm dev --port 5199
//   node scripts/surveyScreenshots.mjs http://localhost:5199 <out-dir>
//
// Headed on purpose: on WSL only a headed Chromium reaches the GPU (through
// the d3d12 Mesa driver); headless falls back to a software renderer.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [baseUrl = 'http://localhost:5173', outDir = 'survey-images'] = process.argv.slice(2)

const VIEWS = [
  ...['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T10'].map((id) => ({
    id,
    query: `t=${id}`,
  })),
  ...['C1', 'C2'].map((id) => ({ id, query: `c=${id}` })),
  ...['halo', 'accent', 'rings'].map((cue) => ({ id: `cue-${cue}`, query: `cue=${cue}` })),
]
const SETTLE_MS = 1500

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=gl', '--ignore-gpu-blocklist'],
  env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' },
})
// 2x device pixels: at 1x thin tubes alias into speckles.
const page = await browser.newPage({
  viewport: { width: 1100, height: 1000 },
  deviceScaleFactor: 2,
})

for (const { id, query } of VIEWS) {
  await page.goto(`${baseUrl}/study/showcase?${query}`)
  const stage = page.locator(`.study-phase1__stage[data-view="${id}"]`)
  await stage.waitFor()
  await page.waitForTimeout(SETTLE_MS)

  if (id === VIEWS[0].id) {
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)
    })
    if (/swiftshader|llvmpipe/i.test(renderer ?? '')) {
      console.warn(`[survey] software renderer (${renderer}); images may not match the study`)
    }
  }

  const label = await stage.getAttribute('data-label')
  const name = id.startsWith('cue-') ? id : `${id.replace(/^T(\d)$/, 'T0$1')}-${slug(label)}`
  const file = join(outDir, `${name}.png`)
  await stage.screenshot({ path: file })
  console.log(file)
}

await browser.close()
