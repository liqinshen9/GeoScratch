# Backend / persistence

GeoScratch is still a client-only SPA. The backend is a single **Supabase**
project (managed Postgres + Auth) that `supabase-js` talks to directly from the
browser. There is no server of our own.

It exists to run user studies and to keep progress for returning users: who a
participant is, and per exercise attempt how long they spent, whether they
passed, the correct/incorrect step counts, and the perceptual-question answer.

## It is optional

`src/lib/supabaseClient.js` reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. If either is missing, `isSupabaseConfigured` is
`false`, `supabase` is `null`, and the whole app runs exactly as it did before:
no gate, no tracking, a small "tracking off" indicator bottom-left. A
contributor can work on the geometry features without a project.

Rules for anything that touches the backend:

- **Never block render or navigation on a write.** Every insert/update is
  fire-and-forget with a `.catch` that logs `[GeoScratch] ...`.
- **RLS is the only security boundary.** The anon key ships in the client
  bundle; it grants exactly what the policies in `supabase/migrations/0001_init.sql`
  allow and nothing else. `service_role` never reaches the client.
- Anonymous auth means **a new browser/device is a new user.** The participant
  code is a grouping key for analysis, not a login. Cross-device "resume as me"
  needs a credential upgrade (future work).

## Project setup

1. Create a project (region near participants). Free tier is enough for a study;
   see "Free-tier caveats" below.
2. Authentication -> Providers -> **enable Anonymous sign-ins** (off by default).
3. Disable email signup / confirmations (unused).
4. Before a lab/group session, raise the anonymous-sign-in and token-refresh
   rate limits (default ~30/hour/IP throttles a room behind one NAT).
5. Run `supabase/migrations/0001_init.sql` in the SQL editor.
6. Copy the Project URL + anon key into `.env.local` (local) and into Vercel env
   vars for Production + Preview + Development. No `vercel.json` change.

## Free-tier caveats

- **7-day inactivity pause.** Daily study traffic keeps it awake; otherwise
  un-pause it from the dashboard (data retained) before each session.
- **No automatic backups.** Export after every session (below). Consider one
  month of Pro ($25) around a high-stakes study for PITR + daily backups.

## Schema

`supabase/migrations/0001_init.sql` is the source of truth. Tables:

| Table                 | Row meaning                                                   |
| --------------------- | ------------------------------------------------------------- |
| `profiles`            | one per auth user; `participant_code`, `cohort`, `user_agent` |
| `exercise_attempts`   | one per exercise open; timing, pass, counts, `mcq_answer`     |
| `workspace_snapshots` | latest Blockly XML per `(profile, workspace_id)` (Phase 2)    |

`profiles` rows are created by the `on_auth_user_created` trigger. RLS restricts
every table to `auth.uid() = profile_id`. No delete policies exist.

### Cohort tagging (`?c=` link)

Local dev and the deployed site share one Supabase project, so test rows and
study rows land in the same tables. To separate them, hand participants a link
with a cohort tag: `https://<site>/?c=study-oct`. On load, `bootstrap()` reads
`?c=`, normalises it (`normalizeCohort` in `src/lib/participantCode.js`: lower
case, `[a-z0-9._-]`, 64 max), stores it in `localStorage['geoscratch:cohort']`,
and writes it to `profiles.cohort`. It survives in-app navigation (which drops
the query string) via localStorage.

A plain dev URL has no `?c=`, so those profiles keep `cohort = NULL` -- that is
how dev data is excluded at export time.

## Client pieces

| File                               | Role                                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| `src/lib/supabaseClient.js`        | the client + `isSupabaseConfigured`                                |
| `src/store/useAuthStore.js`        | `bootstrap()` (anon sign-in, `?c=` cohort), `setParticipantCode()` |
| `src/components/ParticipantGate/`  | blocks all routes until a code is set; "tracking off" badge        |
| `src/store/useTrackingStore.js`    | writes `exercise_attempts`                                         |
| `src/hooks/useExerciseTracking.js` | drives the store from `ExercisePage`                               |
| `src/lib/attemptPayload.js`        | pure row builders (unit-tested)                                    |
| `src/lib/workspaceSync.js`         | Phase 2 snapshot pull/push                                         |

`Layout.jsx` calls `bootstrap()` once on mount and wraps `<Outlet />` in
`<ParticipantGate>`.

### Attempt lifecycle

`useExerciseTracking(exerciseNumber, kind)` in `ExercisePage`:

1. **On open** (exercise or auth-status change): count existing attempts for
   `(profile, exercise)`, insert a row with `attempt_number = count + 1`,
   `started_at`, and stash `performance.now()`.
2. **On first pass** (`result.passed` flips true, or a correct MCQ pick):
   update `completed_at`, `duration_ms`, `passed`, counts, `meta.steps`.
3. **On unmount / exercise switch / tab hide without passing**: best-effort
   update of `duration_ms` + current state. A hard tab-close can lose the final
   duration of an abandoned attempt (reconstruct from the next attempt's
   `started_at` if needed).
4. **MCQ** (perceptual 08/09): `recordMcqAnswer(choiceId, correctId)` updates
   `mcq_answer` / `mcq_correct` and marks the attempt passed when correct.

## Workspace snapshot sync (Phase 2)

`useWorkspaceAutosave.js`, gated behind `shouldSync(authStatus)`:

- First load waits for auth to settle, then `chooseSnapshot({ local, cloud })`
  picks the XML to restore -- **cloud wins** when present.
- Each debounced edit (~3s) upserts `workspace_snapshots`.

Kill switch: remove the `workspace_snapshots` grants, or gate the calls.

## Exporting study data

Un-pause the project first. Export immediately after each session.

- **Quick**: Table editor -> `exercise_attempts` -> filter -> Export CSV.
- **Analysis**: SQL editor -> `select * from study_export where cohort = 'study-oct'`
  -> Download CSV. `study_export` joins attempts to `profiles` (participant_code,
  cohort, ...). Filtering on `cohort` drops dev/test rows (which have
  `cohort NULL`).
- **Backup**:
  `pg_dump "$SUPABASE_DB_URL" --schema=public --data-only -t exercise_attempts -t profiles -t workspace_snapshots > session_YYYYMMDD.sql`
- **Repeatable**: a `scripts/export-study-data.mjs` using the `service_role`
  key + `supabase-js` (run outside the SPA, in a secure environment).

## Future work

- Credential upgrade (`supabase.auth.updateUser` / `linkIdentity`) so a
  returning participant on a new device re-attaches to their code.
- `workspace_events` append-only history (keystroke-level replay).
- In-app researcher export view.
