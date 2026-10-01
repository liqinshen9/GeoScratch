// The editor screenshot the holistic-phase intro shows (public/study/editor.png):
// a solved non-study exercise, with the navigation and dev controls a
// participant never sees hidden.
//
//   node scripts/studyEditorScreenshot.mjs http://localhost:5173 public/study/editor.png

import { chromium } from 'playwright'

const [baseUrl = 'http://localhost:5173', out = 'public/study/editor.png'] = process.argv.slice(2)

const HIDE = [
  'header nav',
  '.exercise-column-heading__nav',
  '.exercise-step-nav',
  '.exercise-task-panel__crumb',
  '.exercise-debug-fill',
  '.exercise-pass-banner',
  '[title^="No backend configured"]',
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${baseUrl}/exercise/translate-object`)
await page.getByText('Fill solution (dev)').click()
await page.getByTitle('Recenter blocks').click()
await page.mouse.move(0, 0)
await page.addStyleTag({ content: `${HIDE.join(', ')} { visibility: hidden !important }` })
await page.waitForTimeout(3000)
await page.screenshot({ path: out })
await browser.close()
