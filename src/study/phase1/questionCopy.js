import { PLACEMENT } from './stimulusConfig'

// What a trial asks, in the participant's words, and where the judged band
// sits on the stage. See docs/architecture/study-phase1.md#questions.

const KIND_NAMES = { line: 'Line', vector: 'Vector', point: 'Point', sphere: 'Sphere' }

/**
 * Each labelled object named with its kind, e.g. { A: 'Line A', B: 'Vector B' },
 * plus C for a distance question. A distance question names the exact point it
 * judges: a vector's tip, any point on a line, a sphere's closest surface point.
 */
export function targetNames(stimulus) {
  const names = { A: 'A', B: 'B', C: 'C' }
  const byTip = stimulus?.question?.type === 'distance'
  for (const object of stimulus?.objects ?? []) {
    const labelled = object.role === 'target' || object.role === 'reference'
    if (!labelled || !KIND_NAMES[object.kind]) continue
    const name = `${KIND_NAMES[object.kind]} ${object.key}`
    names[object.key] = byTip ? (DISTANCE_NAMES[object.kind]?.(name) ?? name) : name
  }
  return names
}

const DISTANCE_NAMES = {
  vector: (name) => `the tip of ${name}`,
  line: (name) => `any point on ${name}`,
  sphere: (name) => `the closest point on the surface of ${name}`,
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const PROMPTS = {
  occlusion: ({ A, B }) =>
    `${A} and ${B} do not touch. Where they overlap on screen, which one is in front?`,
  proximity: () => 'Inside the shaded band, which one is closer to you?',
  // Two lines with a blank one between; the page keeps the line breaks.
  distance: ({ A, B, C }) =>
    `${capitalise(C)} sits on a line. Which of these two is closer to ${C}?\n\n${capitalise(A)} or ${B}?`,
}

const CHOICES = {
  occlusion: ({ A, B }) => ({ A: `${A} in front of ${B}`, B: `${B} in front of ${A}` }),
  proximity: ({ A, B }) => ({ A: `${A} is closer`, B: `${B} is closer` }),
  distance: ({ A, B }) => ({ A: capitalise(A), B: capitalise(B) }),
}

export function questionPrompt(stimulus) {
  return (PROMPTS[stimulus?.question?.type] ?? PROMPTS.occlusion)(targetNames(stimulus))
}

export function choiceLabel(stimulus, choice) {
  return (CHOICES[stimulus?.question?.type] ?? CHOICES.occlusion)(targetNames(stimulus))[choice]
}

/**
 * The judged band as CSS percentages of the stage width, or null for a question
 * that has no band. NDC x runs -1..1 left to right.
 */
export function probeBandStyle(stimulus) {
  if (stimulus?.question?.type !== 'proximity') return null
  const half = PLACEMENT.probeBandHalfWidthNdc
  const centre = stimulus.probeNdc[0]
  const left = Math.max(-1, centre - half)
  const right = Math.min(1, centre + half)
  const percent = (value) => `${Math.round(value * 1000) / 1000}%`
  return { left: percent(((left + 1) / 2) * 100), width: percent(((right - left) / 2) * 100) }
}
