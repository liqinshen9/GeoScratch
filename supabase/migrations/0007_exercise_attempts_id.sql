-- Exercises are identified by a slug ('sphere-distance'), not a number, so every
-- attempt insert failed against the integer exercise_number column. Attempts now
-- record exercise_id; exercise_number stays for old rows only.
-- Apply in the Supabase SQL editor after 0006_phase1_nearer_higher.sql.
-- See docs/architecture/backend.md#schema.

alter table public.exercise_attempts
  add column if not exists exercise_id text,
  alter column exercise_number drop not null;

create index if not exists exercise_attempts_profile_exercise_id_idx
  on public.exercise_attempts (profile_id, exercise_id);

-- Dropped first: create or replace can only append view columns.
drop view if exists public.study_export;
create view public.study_export with (security_invoker = on) as
  select
    p.participant_code,
    p.cohort,
    a.exercise_id,
    a.exercise_number,
    a.exercise_kind,
    a.attempt_number,
    a.started_at,
    a.completed_at,
    a.duration_ms,
    a.passed,
    a.correct_count,
    a.incorrect_count,
    a.mcq_answer,
    a.mcq_correct,
    a.meta,
    a.client_session_id
  from public.exercise_attempts a
  join public.profiles p on p.id = a.profile_id
  order by p.participant_code, a.started_at;
