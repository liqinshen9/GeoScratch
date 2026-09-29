// The pivot exercise's start and goal pictures, screenshotted from the dev-only
// /study/pivot-diagrams scene so they match the 3D view, in both themes.
//
//   pnpm dev --port 5199
//   node scripts/pivotDiagrams.mjs http://localhost:5199
//
// Add --headed on WSL for the GPU renderer (see surveyScreenshots.mjs); the
// default headless run uses a software renderer.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const headed = args.includes('--headed')
const [baseUrl = 'http://localhost:5173', outDir = 'src/exercises/assets'] = args.filter(
  (arg) => !arg.startsWith('--'),
)
const SETTLE_MS = 1500

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch(
  headed
    ? {
        headless: false,
        args: ['--use-angle=gl', '--ignore-gpu-blocklist'],
        env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' },
      }
    : { headless: true },
)
const page = await browser.newPage({
  viewport: { width: 540, height: 430 },
  deviceScaleFactor: 1.5,
})

for (const pose of ['start', 'goal']) {
  for (const theme of ['light', 'dark']) {
    await page.goto(`${baseUrl}/study/pivot-diagrams?pose=${pose}&theme=${theme}`)
    const stage = page.locator(`.study-phase1__stage[data-view="${pose}-${theme}"]`)
    await stage.waitFor()
    await page.waitForTimeout(SETTLE_MS)
    const file = join(outDir, `pivot-${pose}-${theme}.png`)
    await stage.screenshot({ path: file })
    console.log(file)
  }
}

await browser.close()
