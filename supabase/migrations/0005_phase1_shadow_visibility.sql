-- Study Phase 1: how much of each target's overhead shadow lands on a visible,
-- on-screen part of the room (0..1; a point or sphere is 0 or 1, a line or
-- vector the share of its length). Computed from the fixed camera, light and
-- stimulus, so it is logged for every trial; it only matters under T6, T7 and
-- T10. Apply in the Supabase SQL editor after 0004_study_session.sql.
-- See docs/architecture/study-phase1.md#shadow-visibility.

alter table public.phase1_trials
  add column if not exists shadow_visible_a real,
  add column if not exists shadow_visible_b real;

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
    t.label_toggles,
    t.shadow_visible_a,
    t.shadow_visible_b
  from public.phase1_trials t
  join public.profiles p on p.id = t.profile_id
  order by p.participant_code, t.presented_at;
