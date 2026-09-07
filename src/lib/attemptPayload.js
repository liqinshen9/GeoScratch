/**
 * Pure builders for the rows written to `exercise_attempts`. Kept separate from
 * the store/hook so the timing and count logic is unit-testable without a
 * Supabase client. See docs/architecture/backend.md.
 *
 * The `result` object is whatever an exercise module's `evaluate()` returns:
 *   { passed, correct, incorrect, steps, answer, target? }
 * where `steps` is a flat map of step key -> boolean.
 */

/** Whole-millisecond elapsed time from two performance.now() readings. */
export function durationMs(startedPerf, nowPerf) {
  if (typeof startedPerf !== 'number' || typeof nowPerf !== 'number') return null
  return Math.max(0, Math.round(nowPerf - startedPerf))
}

/** Count of passing / failing entries in an evaluate() `steps` map. */
export function countSteps(steps) {
  const values = Object.values(steps ?? {})
  const correct = values.filter(Boolean).length
  return { correct, incorrect: values.length - correct }
}

/** The attempt number for a fresh open, given how many attempts already exist. */
export function nextAttemptNumber(existingCount) {
  return (Number.isFinite(existingCount) ? existingCount : 0) + 1
}

/** Whether a picked MCQ choice id matches the exercise's correct choice. */
export function gradeMcq(answer, correctId) {
  return Boolean(answer) && answer === correctId
}

/**
 * The row inserted when an exercise is opened. `started_at` is wall-clock (for
 * ordering); durations are computed from performance.now() deltas instead.
 */
export function buildAttemptInsert({
  profileId,
  exerciseNumber,
  exerciseKind,
  attemptNumber,
  clientSessionId,
  nowIso,
}) {
  return {
    profile_id: profileId,
    exercise_number: exerciseNumber,
    exercise_kind: exerciseKind ?? null,
    attempt_number: attemptNumber,
    client_session_id: clientSessionId ?? null,
    started_at: nowIso,
    passed: false,
  }
}

/**
 * The update applied when `result.passed` first becomes true (or a correct MCQ
 * is picked). Records the full step breakdown into `meta` for later analysis.
 */
export function buildAttemptCompletion({ result, startedPerf, nowPerf, nowIso }) {
  const { correct, incorrect } = countSteps(result?.steps)
  return {
    completed_at: nowIso,
    duration_ms: durationMs(startedPerf, nowPerf),
    passed: true,
    correct_count: correct,
    incorrect_count: incorrect,
    meta: { steps: result?.steps ?? {} },
  }
}

/**
 * The best-effort update applied on unmount / exercise switch / tab hide when
 * the attempt was never passed: just the elapsed time and current state.
 */
export function buildAttemptProgress({ result, startedPerf, nowPerf }) {
  const { correct, incorrect } = countSteps(result?.steps)
  return {
    duration_ms: durationMs(startedPerf, nowPerf),
    passed: Boolean(result?.passed),
    correct_count: correct,
    incorrect_count: incorrect,
  }
}

/** The update applied when an MCQ answer is picked on a perceptual exercise. */
export function buildMcqUpdate({ answer, correctId, startedPerf, nowPerf, nowIso }) {
  const mcqCorrect = gradeMcq(answer, correctId)
  return {
    mcq_answer: answer ?? null,
    mcq_correct: mcqCorrect,
    passed: mcqCorrect,
    completed_at: mcqCorrect ? nowIso : null,
    duration_ms: durationMs(startedPerf, nowPerf),
  }
}
