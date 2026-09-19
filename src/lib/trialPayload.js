/**
 * Pure builders for the rows written to `phase1_trials`, kept apart from the
 * store so timing and grading are unit-testable without a Supabase client.
 * See docs/architecture/study-phase1.md#logging.
 */

/** Reaction time in ms from two performance.now() readings, to 0.01 ms. */
export function reactionTimeMs(presentedPerf, answeredPerf) {
  if (!Number.isFinite(presentedPerf) || !Number.isFinite(answeredPerf)) return null
  return Math.max(0, Math.round((answeredPerf - presentedPerf) * 100) / 100)
}

export function gradeResponse(response, correctTarget) {
  return Boolean(response) && response === correctTarget
}

export function buildTrialRow({
  profileId,
  clientSessionId,
  buildCommit,
  participantCode,
  blockIndex,
  technique,
  trial,
  stimulus,
  response,
  presentedPerf,
  answeredPerf,
  presentedAtIso,
  settingsSnapshot,
  viewport,
  devicePixelRatio,
  labelToggles,
}) {
  return {
    profile_id: profileId,
    client_session_id: clientSessionId ?? null,
    build_commit: buildCommit ?? null,
    participant_code: participantCode ?? null,
    block_index: blockIndex,
    technique,
    trial_index: trial.trialIndex,
    is_practice: Boolean(trial.practice),
    clutter: stimulus.clutter,
    difficulty: stimulus.difficulty,
    pair_type: stimulus.pairType,
    question_type: stimulus.question?.type ?? null,
    probe_band: stimulus.question?.band ?? null,
    stimulus_id: stimulus.id,
    stimulus_seed: stimulus.seed,
    correct_target: stimulus.nearer,
    response,
    correct: gradeResponse(response, stimulus.nearer),
    rt_ms: reactionTimeMs(presentedPerf, answeredPerf),
    presented_at: presentedAtIso ?? null,
    settings_snapshot: settingsSnapshot ?? {},
    viewport_w: viewport?.width ?? null,
    viewport_h: viewport?.height ?? null,
    device_pixel_ratio: devicePixelRatio ?? null,
    label_toggles: labelToggles ?? 0,
  }
}
