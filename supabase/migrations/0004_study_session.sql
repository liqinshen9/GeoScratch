-- Study session orchestration: the counterbalancing slot, the study setting,
-- the resolved session plan, and one row per step event (start, complete,
-- survey handoff/return). Apply in the Supabase SQL editor after 0003.
-- See docs/architecture/study-session.md.

alter table public.profiles
  add column if not exists study_slot    int,
  add column if not exists study_setting text,     -- lab | remote
  add column if not exists study_plan    jsonb;    -- the resolved step list

create table if not exists public.study_events (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  client_session_id uuid,
  build_commit      text,
  participant_code  text,                        -- the research ID, copied at write time
  step_index        int,
  step_kind         text,                        -- phase1Block | holistic | survey | done
  event             text not null,               -- session_start | step_start | step_complete | survey_return
  detail            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists study_events_profile_idx
  on public.study_events (profile_id, created_at);

alter table public.study_events enable row level security;

drop policy if exists "own study events read"   on public.study_events;
drop policy if exists "own study events insert" on public.study_events;
create policy "own study events read"   on public.study_events for select using (auth.uid() = profile_id);
create policy "own study events insert" on public.study_events for insert with check (auth.uid() = profile_id);
-- No update or delete policies: a logged event is immutable.

create or replace view public.study_events_export with (security_invoker = on) as
  select
    p.participant_code,
    p.cohort,
    p.study_slot,
    p.study_setting,
    e.build_commit,
    e.client_session_id,
    e.step_index,
    e.step_kind,
    e.event,
    e.detail,
    e.created_at
  from public.study_events e
  join public.profiles p on p.id = e.profile_id
  order by p.participant_code, e.created_at;
