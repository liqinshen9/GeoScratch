-- Study Phase 1: a trial now asks one of two questions, so a row has to say
-- which. Apply in the Supabase SQL editor after 0002_phase1_trials.sql.
-- See docs/architecture/study-phase1.md#questions.

alter table public.phase1_trials
  add column if not exists question_type text,  -- occlusion | proximity
  add column if not exists probe_band   text;   -- left | middle | right, proximity only

create or replace view public.phase1_export with (security_invoker = on) as
  select
    p.participant_code,
    p.cohort,
    t.build_commit,
    t.client_session_id,
    t.block_index,
    t.technique,
    t.trial_index,
    t.is_practice,
    t.clutter,
    t.difficulty,
    t.pair_type,
    t.question_type,
    t.probe_band,
    t.stimulus_id,
    t.stimulus_seed,
    t.correct_target,
    t.response,
    t.correct,
    t.rt_ms,
    t.presented_at,
    t.viewport_w,
    t.viewport_h,
    t.device_pixel_ratio,
    t.settings_snapshot,
    t.label_toggles
  from public.phase1_trials t
  join public.profiles p on p.id = t.profile_id
  order by p.participant_code, t.presented_at;
