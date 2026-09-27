-- The identification task (highlighting x labels): one row per answered trial.
-- Apply in the Supabase SQL editor after 0004. See
-- docs/architecture/study-session.md#identification-task.

create table if not exists public.identification_trials (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  client_session_id  uuid,
  build_commit       text,
  participant_code   text,                     -- copied at write time for export
  block_index        int  not null,
  cell               text not null,            -- none | labels | highlight | both
  highlight          boolean not null,
  labels             boolean not null,
  scene_set          int  not null,
  trial_index        int  not null,
  is_practice        boolean not null,
  scene_id           text not null,
  scene_seed         text not null,
  scene_kind         text not null,            -- sphere | cube | point
  target_block_id    text not null,
  errors             int  not null default 0,  -- wrong objects clicked before the right one
  wrong_block_ids    jsonb not null default '[]'::jsonb,
  rt_ms              double precision,         -- first presented frame -> correct click
  presented_at       timestamptz,
  viewport_w         int,
  viewport_h         int,
  device_pixel_ratio real,
  created_at         timestamptz not null default now()
);
create index if not exists identification_trials_profile_idx
  on public.identification_trials (profile_id, block_index, trial_index);

alter table public.identification_trials enable row level security;

drop policy if exists "own identification trials read"   on public.identification_trials;
drop policy if exists "own identification trials insert" on public.identification_trials;
create policy "own identification trials read"   on public.identification_trials for select using (auth.uid() = profile_id);
create policy "own identification trials insert" on public.identification_trials for insert with check (auth.uid() = profile_id);
-- No update or delete policies: a logged trial is immutable.

create or replace view public.identification_export with (security_invoker = on) as
  select
    p.participant_code,
    p.cohort,
    p.study_slot,
    p.study_setting,
    t.build_commit,
    t.block_index,
    t.cell,
    t.highlight,
    t.labels,
    t.scene_set,
    t.trial_index,
    t.is_practice,
    t.scene_id,
    t.scene_seed,
    t.scene_kind,
    t.target_block_id,
    t.errors,
    t.wrong_block_ids,
    t.rt_ms,
    t.presented_at,
    t.viewport_w,
    t.viewport_h,
    t.device_pixel_ratio
  from public.identification_trials t
  join public.profiles p on p.id = t.profile_id
  order by p.participant_code, t.presented_at;
