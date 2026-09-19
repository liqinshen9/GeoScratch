import { PLACEMENT } from './stimulusConfig'

// What a trial asks, in the participant's words, and where the judged band
// sits on the stage. See docs/architecture/study-phase1.md#questions.

const PROMPTS = {
  occlusion: 'Where A and B cross, which one passes in front of the other?',
  proximity: 'Inside the shaded band, which one is closer to you?',
}

const CHOICES = {
  occlusion: { A: 'A in front of B', B: 'B in front of A' },
  proximity: { A: 'A is closer', B: 'B is closer' },
}

export function questionPrompt(question) {
  return PROMPTS[question?.type] ?? PROMPTS.occlusion
}

export function choiceLabel(question, choice) {
  return (CHOICES[question?.type] ?? CHOICES.occlusion)[choice]
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
