# Development guide

This guide records the supported behavior and project-specific constraints
for people maintaining the app and for coding agents. Keep the README brief;
update this guide when behavior or validation expectations change.

## Product constraints

- Build a small, dependable browser app using semantic HTML, CSS, and vanilla
  JavaScript ES modules.
- Do not add frameworks, bundlers, a build step, a backend, a native app,
  automated test suite, PWA installation, service workers, or offline-launch
  infrastructure.
- Prefer native browser capabilities. Do not add dependencies or development
  tooling without a concrete need and user agreement.
- Serve over HTTP locally and HTTPS in production; do not rely on opening files
  directly.

## Supported behavior

### Setup and controls

- The ready screen displays the timer at full size. The top-right menu offers
  5, 10, 15, 20, 30, and 45 minute presets, a whole-number custom duration from
  1 to 1,440 minutes, warning settings, and theme selection. The default is
  20 minutes. Invalid duration input disables Start and explains the problem.
- Settings close with **Done**, **Escape**, or an outside click. Starting
  closes settings. During an active session the timer fills the screen with a
  status line, large digits, presenter controls, and a bottom progress bar;
  warning colors fill the screen. Settings remain hidden while paused or
  recovering a saved session, and can be opened from the menu without pausing.
  Reset returns to the ready screen with settings hidden.
- Pause freezes elapsed time and warnings; resume continues from that exact
  point. Paused time never counts.
- Editing duration sets a new total rather than adding time. Countdown,
  overtime, and warnings are recomputed; a paused session stays paused.
- Reset confirms before returning to setup and retains duration, theme, and
  warning schedule.
- Warning settings contain three descending countdown thresholds and four
  ascending overtime milestones in whole minutes. Defaults are 5, 2, and
  1 minute remaining, then 1, 3, 5, and 10 minutes overtime. Invalid or
  duplicate values are explained and not applied.
- Themes are **System**, **Light**, and **Dark**. Warnings use text as well as
  color; there is no sound or vibration.

### Timing and warnings

- Live timing uses elapsed `performance.now()` timestamps, never a count of
  refresh callbacks. Pause freezes exact elapsed time; resume excludes the
  paused interval. Extending the total duration beyond elapsed time returns an
  overtime session to countdown.
- Display `MM:SS` below one hour and `H:MM:SS` at or above one hour. Positive
  remaining time rounds up so zero is not shown before the deadline. At the
  deadline show `+00:00` and **TIME'S UP**; after one full overtime second show
  `+00:01`. Progress caps at 100% in overtime.
- Skip countdown thresholds greater than the total duration. Advance directly
  to the highest applicable warning, including after returning from the
  background, without replaying intermediate warnings. Duration and warning
  edits recompute levels and labels. Warnings must not flash or shift the
  timer and controls.

### Browser capabilities

- While active, request Screen Wake Lock when supported. Release it when
  paused, reset, hidden, or leaving the page; request it again on return while
  active. Unsupported, denied, or unexpectedly released locks do not stop the
  timer. Show **Screen may sleep** by the session controls and the full reason
  in settings. Pause/resume retries after denial or unexpected release.
- Show **Enter full screen** only when the native Full Screen API is exposed.
  Entry requires a button action; Escape or browser controls can exit.
  Full-screen errors are reported, and entering or leaving full screen never
  pauses or resets the session.
- Browser permissions and platform restrictions may prevent either optional
  capability. A failed optional feature must not stop the timer; report
  unavailability honestly.

### Storage and recovery

- Store the selected theme, warning schedule, last valid duration, and a
  checkpoint of the active or paused session in browser local storage.
  Version and validate persisted data; treat storage as fallible.
- Reset clears the saved active session but retains preferences and duration.
  Paused sessions reload at their exact saved elapsed time. Active sessions
  add wall-clock time since the last checkpoint, then continue using the
  monotonic page timer clock. Refresh checkpoints periodically and when the
  page is hidden or unloaded.
- If the clock moved backward or an active checkpoint cannot be reconciled,
  ask whether to restore paused or discard. Invalid saved sessions require
  returning to setup. Show storage, quota, and invalid preference/duration
  problems in the app. The timer may continue if saving fails, but reload
  recovery may be incomplete.
- Clearing this site's browser data also clears saved settings and session
  state. Device clock changes do not affect a live timer. A backward change
  during reload recovery is detected and requires a choice; a forward change
  cannot always be distinguished from real elapsed time.

## Implementation guidance

- Prefer the simplest complete solution and follow existing conventions.
  Keep changes focused and preserve unrelated work.
- Use small cohesive modules with explicit imports/exports. Separate timer
  calculations and transitions, DOM rendering, and browser integrations.
- Keep one authoritative session state. Derive display values and warning
  levels rather than maintaining competing copies.
- Keep calculations and state transitions free of DOM, storage, and clock
  reads. Pass the current time into logic that needs it.
- Use explicit states and enforce their invariants. Do not allow impossible
  combinations or silently substitute defaults for invalid session state.
- Use descriptive names, consistent units (`Ms` for milliseconds), `const` by
  default, and strict comparisons. Add concise JSDoc only when data shapes,
  units, or contracts need clarification. Comment why, not what code already
  says.
- Make rendering safe to repeat: it must not start timers, register listeners,
  save state, or request browser capabilities. Own and clean up intervals,
  listeners, and wake-lock handles; repeated start/reset cycles must not
  accumulate work.
- Handle visibility changes, reload recovery, and optional API failures
  explicitly. Catch errors at meaningful boundaries, such as storage and
  browser API calls, and explain actionable failures in the UI. Avoid empty
  catches and success-shaped fallbacks.
- Use native buttons, inputs, labels, and dialogs. Keep keyboard operation,
  visible focus, accessible names, and sensible focus restoration intact. Do
  not announce the timer every second to screen readers; announce meaningful
  status changes.
- Use CSS custom properties for themes and warning treatments, separating
  layout from state styling. Use tabular digits and stable dimensions; respect
  reduced motion and never rely on color alone to convey urgency.
- Design for touch and constrained tablet viewports in both orientations;
  account for safe areas and changing browser chrome. Keep application code in
  external modules and use DOM text/property APIs rather than injecting HTML
  from input or saved data.

## Local preview and deployment

Run the static site locally:

```sh
python3 -m http.server 8000 --directory site
```

Open <http://localhost:8000>. `localhost` is treated as a secure context by
browsers for APIs that require one.

The [deployment workflow](../.github/workflows/deploy-pages.yml) publishes
only [site/](../site/) on pushes to `main`. It can also be run manually from
the repository's Actions tab after the workflow is on the default branch.
Repository **Settings > Pages > Build and deployment** must use **GitHub
Actions**. The workflow uses the built-in `GITHUB_TOKEN` and OpenID Connect;
no personal access token or repository secret is needed. The deployed app is
<https://rkondratowicz.github.io/presentation-timer/>.

## Manual browser validation

There is no automated test suite or build step. Before deployment, check:

- Default, preset, custom, and invalid durations; saved preferences; all
  themes.
- Countdown rounding, the exact deadline transition, and countdown/overtime
  formatting below and above one hour.
- Pause/resume before and after the deadline, with no elapsed-time or warning
  advancement while paused.
- Reset confirmation and cancellation; duration changes during countdown,
  overtime, and pause.
- Default/custom warning thresholds, invalid settings, thresholds skipped for
  short sessions, and multiple thresholds crossed while backgrounded.
- Background/return, reload recovery for active and paused sessions, and
  back-forward navigation; invalid checkpoints and storage failures.
- Wake-lock/full-screen availability, success, denial, and release.
- Keyboard operation, visible focus, and focus restoration after dialogs.
- Settings start hidden on the ready screen and stay hidden on start or reload
  of active/paused sessions; the menu opens them without shrinking the timer.
  Check Done, Escape, outside clicks, warning-dialog focus restoration, and
  hidden settings after reset.
- Phone, tablet, and desktop layouts in portrait and landscape: readable
  digits that fill the session view for `MM:SS`, `+MM:SS`, and `H:MM:SS`,
  visible controls, no horizontal overflow or clipping, and warnings that do
  not disrupt the layout. Tablet timer views should need no scrolling.
  Orientation and full-screen changes must preserve the session.

Record what was checked and what remains unverified. Browser viewport emulation
is useful for layout checks but does not verify device-specific behavior such
as iPad Safari; actual iPad testing is not required.
