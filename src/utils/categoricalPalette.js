import { Hct, labFromArgb } from '@material/material-color-utilities'

// Maximally distinguishable categorical hues at one shared lightness.
// See docs/architecture/color-system.md#how-the-type-hues-are-chosen.

const DEG = Math.PI / 180

// CIEDE2000, following Sharma, Wu & Dalal (2005).
export function deltaE2000([l1, a1, b1], [l2, a2, b2]) {
  const c1 = Math.hypot(a1, b1)
  const c2 = Math.hypot(a2, b2)
  const cBar7 = ((c1 + c2) / 2) ** 7
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)))
  const a1p = a1 * (1 + g)
  const a2p = a2 * (1 + g)
  const c1p = Math.hypot(a1p, b1)
  const c2p = Math.hypot(a2p, b2)
  const hueAngle = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / DEG + 360) % 360)
  const h1p = hueAngle(b1, a1p)
  const h2p = hueAngle(b2, a2p)

  const dLp = l2 - l1
  const dCp = c2p - c1p
  let dhp = 0
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp / 2) * DEG)

  const lBarp = (l1 + l2) / 2
  const cBarp = (c1p + c2p) / 2
  let hBarp = h1p + h2p
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarp /= 2
    else hBarp = h1p + h2p < 360 ? (hBarp + 360) / 2 : (hBarp - 360) / 2
  }
  const t =
    1 -
    0.17 * Math.cos((hBarp - 30) * DEG) +
    0.24 * Math.cos(2 * hBarp * DEG) +
    0.32 * Math.cos((3 * hBarp + 6) * DEG) -
    0.2 * Math.cos((4 * hBarp - 63) * DEG)
  const dTheta = 30 * Math.exp(-(((hBarp - 275) / 25) ** 2))
  const cBarp7 = cBarp ** 7
  const rc = 2 * Math.sqrt(cBarp7 / (cBarp7 + 25 ** 7))
  const sl = 1 + (0.015 * (lBarp - 50) ** 2) / Math.sqrt(20 + (lBarp - 50) ** 2)
  const sc = 1 + 0.045 * cBarp
  const sh = 1 + 0.015 * cBarp * t
  const rt = -Math.sin(2 * dTheta * DEG) * rc

  return Math.sqrt(
    (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh),
  )
}

export function labAt(hue, chroma, tone) {
  return labFromArgb(Hct.from(hue, chroma, tone).toInt())
}

// Every pairwise difference, smallest first, across all the tones the palette
// renders at (light and dark theme).
function sortedDifferences(members, tones) {
  const out = []
  for (const tone of tones) {
    const labs = members.map((m) => labAt(m.hue, m.chroma, tone))
    for (let i = 0; i < labs.length; i++) {
      for (let j = i + 1; j < labs.length; j++) out.push(deltaE2000(labs[i], labs[j]))
    }
  }
  return out.sort((x, y) => x - y)
}

export function minPairwiseDifference(members, tones) {
  return sortedDifferences(members, tones)[0]
}

// Lexicographic on the sorted differences: the worst pair decides, and the
// next-worst breaks ties, which keeps a max-min search off its plateaus.
function better(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length, 4); i++) {
    if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] > b[i]
  }
  return false
}

/**
 * `count` hues at one chroma that maximise the smallest pairwise CIEDE2000
 * difference, alongside `fixed` members (e.g. a neutral), at every tone in
 * `tones`. Deterministic: evenly spaced starts, then coordinate ascent in
 * whole degrees. Returns the hues ascending.
 */
export function optimizeHues({ count, chroma, tones, fixed = [] }) {
  const spacing = 360 / count
  const score = (hues) =>
    sortedDifferences([...hues.map((hue) => ({ hue, chroma })), ...fixed], tones)

  let best = null
  let bestScore = null
  for (let offset = 0; offset < spacing; offset += 3) {
    let hues = Array.from({ length: count }, (_, i) => Math.round(offset + i * spacing) % 360)
    let current = score(hues)
    for (const step of [12, 6, 3, 1]) {
      let improved = true
      while (improved) {
        improved = false
        for (let i = 0; i < count; i++) {
          for (const delta of [step, -step]) {
            const candidate = hues.slice()
            candidate[i] = (candidate[i] + delta + 360) % 360
            const candidateScore = score(candidate)
            if (better(candidateScore, current)) {
              hues = candidate
              current = candidateScore
              improved = true
            }
          }
        }
      }
    }
    if (!bestScore || better(current, bestScore)) {
      best = hues
      bestScore = current
    }
  }
  return best.slice().sort((a, b) => a - b)
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function permutations(items) {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

/**
 * Assigns `hues` to the keys of `reference` ({ key: hue }) so the total hue
 * shift from the reference is smallest: a type keeps roughly the colour it had.
 */
export function assignHues(hues, reference) {
  const keys = Object.keys(reference)
  let best = null
  let bestCost = Infinity
  for (const order of permutations(hues)) {
    const cost = keys.reduce((sum, key, i) => sum + hueDistance(order[i], reference[key]), 0)
    if (cost < bestCost) {
      bestCost = cost
      best = order
    }
  }
  return Object.fromEntries(keys.map((key, i) => [key, best[i]]))
}
