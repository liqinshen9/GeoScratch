-- Study Phase 1: whether the nearer target's judged point sits higher on
-- screen than the other's. Height in the visual field reads as distance, and
-- from the raised study camera the higher object is often the nearer one, so
-- the generator balances this within each question type and each row records
-- it. Null for occlusion questions (both targets meet at the crossing).
-- Apply in the Supabase SQL editor after 0005_phase1_shadow_visibility.sql.
-- See docs/architecture/study-phase1.md#height-in-the-visual-field.

alter table public.phase1_trials
  add column if not exists nearer_higher boolean;

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
    t.shadow_visible_b,
    t.nearer_higher
  from public.phase1_trials t
  join public.profiles p on p.id = t.profile_id
  order by p.participant_code, t.presented_at;
