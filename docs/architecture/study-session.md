# Study session: the full participant flow

The dissertation Method runs one session per participant: ten Phase 1 blocks,
each followed by a questionnaire, then four holistic authoring conditions, each
followed by a questionnaire, then a post-study questionnaire. The demographic
questionnaire is run separately, outside GeoScratch. This doc covers how
`/study` strings those together. Phase 1 trials themselves are in
[study-phase1.md](study-phase1.md).

Code: `src/study/session/`, `src/pages/Study{Session,Task,Return}Page.jsx`,
`src/components/StudyGate/`, migration `0004_study_session.sql`.

## Starting a session

The researcher opens `/study` (with `?c=<cohort>` for real data). `StudyGate`
asks for:

- the **slot**, 1, 2, 3, ... in order. It picks the Phase 1 Williams row
  (`(slot - 1) % 10`) and the holistic order, so handing out slots in sequence
  fills both squares evenly.
- the **setting**, lab or remote, a covariate in the Method.

GeoScratch then generates the **research ID** (`researchId.js`): six characters
from an alphabet with no look-alikes (no 0/O, 1/I/L, 2/Z, 5/S, 8/B), because
it is copied by hand into the demographic survey. It becomes the profile's
`participant_code`, so every existing table (`phase1_trials`,
`exercise_attempts`) joins on it unchanged. The welcome screen shows the ID in
large type, and it stays in the corner of every screen between tasks.

The Phase 1 shuffles are still seeded by the ID; only the row choice moves to
the slot (`participantRow(code, rows, slot)`).

**One device, several participants.** If the browser already carries a code,
starting a session first signs out and signs in a fresh anonymous user
(`resetIdentity`). Otherwise the new participant's slot and plan would overwrite
the last participant's profile row. The "All done" screen has a researcher
button that does the same.

## The plan and the cursor

`buildSessionPlan({ researchId, slot })` expands to a flat list of steps:

```
phase1Block, survey(perBlock)   x10
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

| Survey   | Fields                                                                    |
| -------- | ------------------------------------------------------------------------- |
| perBlock | `participantID`, `blockOrder` (1-10), `technique` (T1-T10)                |
| holistic | `participantID`, `conditionOrder` (1-4), `combinationNum`, `renderMode`   |
| post     | `participantID`, `phase1Order` (`T3-T4-...`), `holisticOrder` (`3-4-1-2`) |

Each survey's end-of-survey redirect must point at

```
https://<deployment>/study/return?participantID=${e://Field/participantID}
```

The redirect lands in the survey's tab. `/study/return` advances the cursor in
localStorage there and tries `window.close()`, which works for a tab the
browser opened from the link. If the tab stays open, it asks the participant to
close it. The waiting tab picks up the change through the `storage` event, and
by re-reading on `focus` as a backstop, and moves on by itself.

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
(`useCurrentStudyTask`):

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
cause was not traced, because running the literal exercise page removed that
shell and every difference between it and the normal page.

- **Configuration** (`configurationSettings`): baseline is T1 and
  perception-driven is T10, on the cue keys only (`CUE_SETTING_KEYS`), plus
  `labelDetail` nameOnly / nameAndValue, plus `STUDY_PINNED_SETTINGS` (light
  theme, no per-instance colour variation), which Phase 1 pins too. Other
  settings stay as the editor has them, since this is authoring and not a
  controlled probe. The condition wins over the exercise's own
  `settingsOverrides`.
- **Mode**: static hides the animation transport in the 3D View header and
  the exercise's own `AnimationButton`.
- **Cap**: six minutes from the step's first start. That time is wall-clock
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

`cube-point-pivot-rotation` has its own `settingsOverrides`. The condition's
settings are layered over them, so its shadows-off and label detail give way
to the configuration like any other task's. Two of its own settings still
apply, because no condition sets them: `cubeShowEdges` (the rotation reads
from the edges) and `objectHighlightStyle: 'glow'`, where every other task
uses the default blink. Its step animation (`AnimationButton`) is hidden in
the static conditions like the transport.

## Logging

`study_events`, one row per event, fire-and-forget:

- `session_start`: slot, setting, viewport, device pixel ratio, user agent
- `step_start`: a block begun, a task opened, a questionnaire screen shown
- `step_complete`: a block or task finished. A task's detail has `passed`,
  `time_to_pass_ms`, `elapsed_ms`, `timed_out`
- `survey_return`: with `handed_off_at`, the time of the handoff click

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
