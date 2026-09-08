-- GeoScratch backend schema. Apply in the Supabase SQL editor (or via the CLI).
-- Kept in-repo for review even though it is applied by hand.
-- See docs/architecture/backend.md.

-- profiles: one row per auth user, created automatically by the trigger below.
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  participant_code text,                       -- study join key, NOT unique: a
                                               -- second device is a new anon
                                               -- user with the same code
  cohort           text,
  is_anonymous     boolean not null default true,
  user_agent       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists profiles_participant_code_idx
  on public.profiles (participant_code);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- exercise_attempts: one row per exercise open (abandoned attempts included).
create table if not exists public.exercise_attempts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  exercise_number   int  not null,
  attempt_number    int  not null default 1,
  started_at        timestamptz not null,
  completed_at      timestamptz,
  duration_ms       int,                       -- performance.now() deltas, not wall clock
  passed            boolean not null default false,
  correct_count     int not null default 0,
  incorrect_count   int not null default 0,
  mcq_answer        text,                      -- perceptual exercises 08/09 only
  mcq_correct       boolean,
  exercise_kind     text,
  client_session_id uuid,                      -- groups attempts from one page-load
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists exercise_attempts_profile_exercise_idx
  on public.exercise_attempts (profile_id, exercise_number);
create index if not exists exercise_attempts_exercise_idx
  on public.exercise_attempts (exercise_number);

-- workspace_snapshots (Phase 2): latest Blockly XML per (participant, workspace).
create table if not exists public.workspace_snapshots (
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  workspace_id    text not null,               -- BlocksCanvas id, e.g. 'exercise-3'
  exercise_number int,
  xml             text not null,
  updated_at      timestamptz not null default now(),
  primary key (profile_id, workspace_id)
);

-- Row level security: RLS is the ONLY boundary. The anon key in the client
-- bundle grants nothing these policies do not allow. Anonymous users have a
-- normal auth.uid().
alter table public.profiles            enable row level security;
alter table public.exercise_attempts   enable row level security;
alter table public.workspace_snapshots enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own attempts read"   on public.exercise_attempts;
drop policy if exists "own attempts insert" on public.exercise_attempts;
drop policy if exists "own attempts update" on public.exercise_attempts;
create policy "own attempts read"   on public.exercise_attempts for select using (auth.uid() = profile_id);
create policy "own attempts insert" on public.exercise_attempts for insert with check (auth.uid() = profile_id);
create policy "own attempts update" on public.exercise_attempts for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "own snapshots read"   on public.workspace_snapshots;
drop policy if exists "own snapshots insert" on public.workspace_snapshots;
drop policy if exists "own snapshots update" on public.workspace_snapshots;
create policy "own snapshots read"   on public.workspace_snapshots for select using (auth.uid() = profile_id);
create policy "own snapshots insert" on public.workspace_snapshots for insert with check (auth.uid() = profile_id);
create policy "own snapshots update" on public.workspace_snapshots for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
-- No delete policies anywhere: participants cannot delete study data.

-- study_export: the flat view researchers download as CSV.
create or replace view public.study_export with (security_invoker = on) as
  select
    p.participant_code,
    p.cohort,
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
  order by p.participant_code, a.exercise_number, a.attempt_number;
