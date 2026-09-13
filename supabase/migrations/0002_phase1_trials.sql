-- Study Phase 1: one row per perceptual trial. Apply in the Supabase SQL editor
-- after 0001_init.sql. See docs/architecture/study-phase1.md.

-- The resolved counterbalancing sequence (technique order + trial orders),
-- recorded so analysis does not depend on the generator staying unchanged.
-- Covered by the existing "own profile update" policy.
alter table public.profiles
  add column if not exists phase1_sequence jsonb;

create table if not exists public.phase1_trials (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  client_session_id  uuid,
  build_commit       text,
  participant_code   text,                     -- copied at write time for export
  block_index        int  not null,
  technique          text not null,            -- T1..T10
  trial_index        int  not null,
  is_practice        boolean not null,
  clutter            text not null,            -- low | high
  difficulty         text not null,            -- easy | medium | hard
  pair_type          text,                     -- line-line | line-point
  stimulus_id        text not null,
  stimulus_seed      text not null,
  correct_target     text not null,            -- A | B
  response           text,                     -- A | B
  correct            boolean not null,
  rt_ms              double precision,         -- performance.now() delta from first presented frame
  presented_at       timestamptz,
  settings_snapshot  jsonb not null default '{}'::jsonb,
  viewport_w         int,
  viewport_h         int,
  device_pixel_ratio real,
  label_toggles      int not null default 0,   -- clicks hiding/showing A or B's label before answering
  created_at         timestamptz not null default now()
);
-- For a database that ran an earlier version of this file.
alter table public.phase1_trials
  add column if not exists label_toggles int not null default 0;
create index if not exists phase1_trials_profile_idx
  on public.phase1_trials (profile_id, block_index, trial_index);

alter table public.phase1_trials enable row level security;

drop policy if exists "own phase1 trials read"   on public.phase1_trials;
drop policy if exists "own phase1 trials insert" on public.phase1_trials;
create policy "own phase1 trials read"   on public.phase1_trials for select using (auth.uid() = profile_id);
create policy "own phase1 trials insert" on public.phase1_trials for insert with check (auth.uid() = profile_id);
-- No update or delete policies: a logged trial is immutable.

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
