/**
 * Seeded randomness for Phase 1. Everything a participant sees (stimuli,
 * technique order, trial order) must be reproducible from a seed string alone,
 * so nothing here may touch Math.random.
 */

/** FNV-1a over a string -> unsigned 32-bit seed (same hash as colorSystem.js). */
export function hashSeed(str) {
  let hash = 0x811c9dc5
  const text = String(str)
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: a tiny, well-distributed 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded generator with the handful of draws the study needs. */
export function createRng(seed) {
  const next = mulberry32(typeof seed === 'number' ? seed : hashSeed(seed))
  const rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    token: (length = 6) => {
      let out = ''
      for (let i = 0; i < length; i++) out += Math.floor(next() * 36).toString(36)
      return out
    },
  }
  return rng
}
