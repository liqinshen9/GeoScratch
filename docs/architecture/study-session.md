# Study session: the full participant flow

The dissertation Method runs one session per participant: a demographic
questionnaire, nine Phase 1 blocks, each followed by a questionnaire, then four
holistic authoring conditions, each followed by a questionnaire, then a
post-study questionnaire. This doc covers how
`/study` strings those together. Phase 1 trials themselves are in
[study-phase1.md](study-phase1.md).

Code: `src/study/session/`, `src/pages/Study{Session,Task,Return}Page.jsx`,
`src/components/StudyGate/`, migration `0004_study_session.sql`.

## Starting a session

Every session starts from a participant's own link, made ahead of time. There
is no in-app form: `/study` without link parameters only asks for the link
from the invitation email. A lab session is the researcher opening that
participant's link on the lab machine; for dev, generate a link against
`http://localhost:5173`.

```
node scripts/studyLinks.mjs --base https://<deployment> --cohort cohort1 --from 1 --count 30 > links.csv
```

Each row is a slot, a research ID and `/study?c=<cohort>&slot=<n>&id=<ID>`.
Keep the sheet: it is the only record of which ID went to which person (needed
for a withdrawal request). `--from` starts a later batch after the last slot
handed out.

- The **slot** picks the Phase 1 Williams row (`(slot - 1) % 18`, since nine conditions need 18 orders) and the
  holistic order, so handing out slots in sequence fills both squares evenly.
- The **research ID** (`generateResearchId` in `researchId.js`) is six
  characters from an alphabet with no look-alikes (no 0/O, 1/I/L, 2/Z, 5/S,
  8/B), in case it is read off the screen and copied by hand. It becomes the
  profile's `participant_code`, so every existing table (`phase1_trials`,
  `exercise_attempts`) joins on it unchanged. The welcome screen shows it in
  large type, and it stays in the corner of every screen between tasks.

`StudyGate` starts the session from those parameters by itself. Opening the
link again on the same device resumes that session, because the ID matches the
stored one. Any other session on the device is replaced. Opening it on a second
device starts that ID over from the first step: progress lives only on the
device, and both attempts land in the data under the same ID.

A participant could edit `slot=` in the URL. That is accepted as unlikely.

**Trying it out.** `TEST1`, `TEST2`, ... are reserved research IDs: the S keeps
them out of the generated alphabet. `/study?slot=1&id=TEST1` runs a session
without a cohort, so exports that filter on `cohort` leave it out. Reopening the
same link resumes it; use the next number to start fresh. A link whose `id` is
neither shows "This study link is not valid" rather than the invitation screen.

The Phase 1 shuffles are still seeded by the ID; only the row choice moves to
the slot (`participantRow(code, rows, slot)`).

**One device, several participants.** If the browser already carries a code,
starting a session first signs out and signs in a fresh anonymous user
(`resetIdentity`). Otherwise the new participant's slot and plan would overwrite
the last participant's profile row. Participants take part on their own
computers, so the "All done" screen just thanks them; opening a new link is
what starts a new session.

## The plan and the cursor

`buildSessionPlan({ researchId, slot })` expands to a flat list of steps:

```
survey(demographic)
phase1Block, survey(perBlock)   x9
holistic,    survey(holistic)   x4
survey(post)
done
```

It is deterministic, and the resolved plan is also written to
`profiles.study_plan` so analysis never depends on the generator.

The cursor (`{ stepIndex, awaiting, startedAt }`) lives in localStorage under
`geoscratch:study-session:<researchId>`, because the session leaves the app for
every questionnaire and has to come back to the right place. `/study` reads it
and redirects to `/study/phase1` or to the current task's `/exercise/<id>`, or
shows the questionnaire handoff or the finish screen. The cursor is one zustand
store shared by every component (`useStudySession`), so the layout's lock, the
exercise page and the `/study` screens always agree on the step.

A Phase 1 block ends by completing its session step, saving the Phase 1 page's
own cursor at the next block, and going to `/study`. The page saves that cursor
itself because navigating away unmounts it before its save effect runs. On the
way back in, the session's block wins over a stale Phase 1 cursor
(`resumeCursor`).

## Qualtrics handoff and return

Each questionnaire opens in a **new tab** with its embedded data as query
parameters (`surveyUrl`). The GeoScratch tab stays put and shows a waiting
screen, so a participant always has a way back even if a redirect is missing:

| Survey      | Fields                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| demographic | `participantID`                                                           |
| perBlock    | `participantID`, `blockOrder` (1-9), `technique` (T1-T8, T10)             |
| holistic    | `participantID`, `conditionOrder` (1-4), `combinationNum`, `renderMode`   |
| post        | `participantID`, `phase1Order` (`T3-T4-...`), `holisticOrder` (`3-4-1-2`) |

Every survey also gets `cohort` (from the link's `?c=`), so `test` responses
can be filtered out in Qualtrics. Like the fields above, it must be declared as
embedded data in each survey's flow, or Qualtrics drops it.

Each survey's end-of-survey redirect must point at

```
https://<deployment>/study/return?participantID=${e://Field/participantID}
```

There are two copies of every survey. `TEST_SURVEYS` (the originals) redirect to
`http://localhost:5173` and are used by a dev build; `LIVE_SURVEYS` (imported
from the `_v2` exports) redirect to `https://geoscratch.xyz` and are used by the
deployed build, `test` cohort included. `SURVEYS` picks between them on
`import.meta.env.DEV`. A survey edited in Qualtrics has to be edited in the copy
that matters, and published.

The redirect lands in the survey's tab. `/study/return` advances the cursor in
localStorage there and tries `window.close()`, which works for a tab the
browser opened from the link. If the tab stays open, it asks the participant to
close it. The waiting tab picks up the change through the `storage` event, and
by re-reading on `focus` as a backstop, and moves on by itself.

Because the first step is a questionnaire, the welcome screen holds off
starting it until Begin is pressed. A survey whose URL in `SURVEYS` is still
`null` shows only the researcher's continue button, logged with
`link_unset: true`.

The waiting screen also has "Open it again" for a closed survey tab, and a
confirm-guarded researcher button that continues without the redirect. That
button is logged as a `survey_return` with `manual: true`.

**A return advances only past the survey this browser handed off to**
(`acceptReturn`). Clicking "Open questionnaire" records `awaiting`; the return
must match it, and clears it. Without this, reloading
the return URL would skip a step, and after the fourth holistic survey the step
it would skip is the post-study questionnaire. A return carrying a different
`participantID` is refused with a message for the researcher.

## Holistic tasks

A holistic task is the ordinary exercise at `/exercise/<id>`, in the normal
app layout, with **study mode** on while it is the session's current step
(`useCurrentStudyTask`).

Before each task, `/study` shows a briefing (`HolisticBriefing` in
`StudySessionPage`): task N of 4, its title and time limit, and the Play hint in
an animated condition. Before the first task it opens with four intro pages,
since participants have had no hands-on introduction to the editor: the phase,
the editor's four panels (over `public/study/editor.png`, made by
`scripts/studyEditorScreenshot.mjs`), working with blocks, and the 3D view and
time limit. The task starts (`startedAt`, `step_start`, the clock) on Start,
not when the exercise opens, so reading the briefing never eats into the cap.
Until then `Layout` sends the exercise route back to `/study`.

Once started:

- `Layout` sends every other route back to the task's exercise, and the header
  drops its links (Exercises, Sandbox, Settings, theme) and its logo link.
- `ExercisePage` hides the browse / previous / next buttons and the unit
  breadcrumb, and adds `StudyTaskBar` (time left, Continue) to the task panel.
  Continue completes the step and goes to `/study`, which opens the
  questionnaire; its return moves the session to the next task's exercise.
- The workspace id is the exercise's usual `exercise-<id>`, so blocks run in
  exercise mode exactly as on the normal page. To keep a previous
  participant's work out of it, starting a session always signs in a fresh
  anonymous user (no cloud snapshots) and clears the local autosaves of the
  four task exercises.

An earlier version ran the tasks inside the `/study` shell, and number fields
there opened Blockly's `window.prompt` editor instead of the inline one. The
cause turned out not to be the shell: Blockly uses the prompt whenever
`modalInputs` is on (its default) and its user-agent check classes the browser
as a phone or tablet, and the same happened later on the normal exercise page.
The workspace now sets `modalInputs: false` (`core/Workspace.jsx`).

- **Configuration** (`configurationSettings`): baseline is T1 and
  perception-driven is T10, on the cue keys only (`CUE_SETTING_KEYS`), plus
  `labelDetail` nameOnly / nameAndValue, plus `STUDY_PINNED_SETTINGS` (light
  theme, no per-instance colour variation), which Phase 1 pins too. Other
  settings stay as the editor has them, since this is authoring and not a
  controlled probe. The condition wins over the exercise's own
  `settingsOverrides`.
- **Mode**: static hides the animation transport in the 3D View header. In
  an animated condition an unplayed condition means nothing, so the task bar
  says to press Play, Play pulses until it is first pressed, and every play is
  logged (`animation_play`). With nothing selected, Play falls back to the
  task's main object ([animation.md](animation.md#fallback-target)).
- **Cap**: six minutes from the step's first start, ten for `transform-object`,
  which has two parts (`holisticTaskCapMs`). That time is wall-clock
  and kept in the cursor, so a reload does not reset it. Continue unlocks when
  the checker first passes or the cap runs out.

Selection highlighting and labels are not isolated anywhere in the study:
highlighting is on in every condition because it arms the animation target,
and labels change only as part of the configuration. The holistic questionnaire
asks about them instead. A controlled task was tried and dropped because both
cues exist to show which object a block makes, so any task whose answer is
that mapping is answered by the cue itself.

### Holistic order

`resolveHolisticOrder(slot)`: `(slot - 1) % 4` picks whether static or
animated comes first and which configuration comes first within each mode. The
task Latin square row is `(s + floor(s / 4)) % 4`, which crosses it with the
order group (slots 1-16 cover all 16 pairs) instead of locking the two
together. Over 20 slots each task meets each combination five times;
`holistic.test.js` pins that.

Tasks: `transform-object` and `cube-point-pivot-rotation` (transform
problems), `point-plane-distance` and `sphere-distance` (derivation problems).

`transform-object` is the high-clutter task, where the cues the other tasks
rarely trigger have to work. Its lines pass through solids (collision accents)
and cross in front of one another (halos), among decorative objects. Part A
moves line L1 with a pipeline, translate then rotate, so it threads a sphere, a
cube and the teapot. Part B takes n = VA × VB with the Cross Product block,
draws line N along it through the teapot, and translates the teapot 2n along N,
so its spout tip touches line L2. The givens the student plugs into pipelines
(L1, the teapot) are seeded only when missing, and `ensureWorkspace` puts them
back after Clear; the rest are reset on every entry. It starts from azimuth 30,
since at the default 45 L1 reads as horizontal and every line across it as
vertical, on top of the Y axis.

`cube-point-pivot-rotation` has its own `settingsOverrides`. The condition's
settings are layered over them, so its shadows-off and label detail give way
to the configuration like any other task's. The settings no condition sets
still apply: `cubeShowEdges` and `cubeShowCentre` (the rotation reads from the
edges and the centre), and `pipelineStepAnimation`, which it shares with
`transform-object` so both play their pipelines step by step
([animation.md](animation.md#step-by-step-pipelines)).

## Finishing

Reaching the last step ends the study on that browser. The end screen logs
`session_complete`, waits `STUDY_FINISH_DELAY_MS` (3 s) so the final survey's
return and that event have landed, then calls `useAuthStore.finishStudy()`:

- the research ID goes on a completed list (`geoscratch:studyCompleted`), so
  reopening the link shows "Already completed" instead of starting a second
  session under the same ID;
- the stored research ID, study identity and cohort are cleared and the
  anonymous login is signed out, so using GeoScratch afterwards on that
  browser is a new visitor, not more rows under the participant's ID.

`/study/return` does the same after the last survey, in case the GeoScratch tab
is already closed. Signing out cannot lose study data: every row is written as
it happens, before this.

A production build with no backend (`status === 'offline'`) refuses to run the
study at all ("not available"). Without it a missing environment variable on
the host silently records nothing, which is exactly what happened to the first
pilot. A dev build still runs offline.

## Dev tools

The study's shortcuts show in a dev build (`pnpm dev`) and for the `test`
cohort (`?c=test`), via `useStudyDevTools()` in `study/session/devTools.js`:

- Phase 1: feedback on every trial, Previous / Next trial, Skip to next / final
  block, and the block's technique in a panel under the answers.
- Block-end and survey screens: Skip questionnaire.
- Holistic tasks: Skip task, and Fill solution in the exercise panel.

A test cohort link against the deployed site therefore walks the whole flow in
a few minutes, while every other cohort gets the participant build. They are
gated on the cohort rather than compiled out, so a participant who edits their
link to `c=test` would see them; their data would then be filed under `test`
and fall out of the `cohort1` export, which is the safe direction. Skipped
steps log as usual (`dev_skip: true` on a skipped survey), and skipping a
trial writes no trial row.

## Logging

`study_events`, one row per event, fire-and-forget:

- `session_start`: slot, viewport, device pixel ratio, user agent
- `step_start`: a block begun, a task's Start pressed, a questionnaire screen shown
- `step_complete`: a block or task finished. A task's detail has `passed`,
  `time_to_pass_ms`, `elapsed_ms`, `timed_out`
- `survey_return`: with `handed_off_at`, the time of the handoff click
- `animation_play`: Play pressed in an animated task, with `exercise_id` and
  `from_progress` (0 for a fresh play, less than 1 when resuming a pause)

The handoff click itself is logged only locally, and its time arrives with the
return. A participant who drops out inside a questionnaire shows up as a
`step_start` for that survey with no `survey_return`, which is enough to place
the dropout.

```sql
select * from study_events_export where cohort = '<cohort>';
```

## Not built yet

- Richer holistic logging (edit, deletion, camera and playback counts,
  selection events). The `exercise_attempts` row and workspace snapshot are
  written as for any exercise.
