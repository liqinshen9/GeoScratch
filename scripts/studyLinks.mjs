// One /study link per participant slot, for emailing remote participants.
// Prints CSV (slot, researchId, url) to stdout. Keep the sheet: it is the only
// record of which ID went to which person.
//
//   node scripts/studyLinks.mjs --base https://<deployment> --cohort cohort1 --from 1 --count 30 > links.csv
//
// Use --from to add later batches without reusing a slot. See
// docs/architecture/study-session.md.

import { parseArgs } from 'node:util'
import { generateResearchId } from '../src/study/session/researchId.js'

const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    cohort: { type: 'string' },
    from: { type: 'string', default: '1' },
    count: { type: 'string', default: '20' },
  },
})

if (!values.base || !values.cohort) {
  console.error(
    'Usage: node scripts/studyLinks.mjs --base <url> --cohort <name> [--from 1] [--count 20]',
  )
  process.exit(1)
}

const from = Number.parseInt(values.from, 10)
const count = Number.parseInt(values.count, 10)
const ids = new Set()

console.log('slot,researchId,url')
for (let slot = from; slot < from + count; slot++) {
  let id
  do id = generateResearchId()
  while (ids.has(id))
  ids.add(id)
  const url = new URL('/study', values.base)
  url.searchParams.set('c', values.cohort)
  url.searchParams.set('slot', String(slot))
  url.searchParams.set('id', id)
  console.log(`${slot},${id},${url}`)
}
