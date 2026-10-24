# Presentation Timer

A silent, tablet-first presentation timer with a countdown, configurable visual
warnings, overtime display, pause/resume, total-duration editing, and
system/light/dark themes. Preferences and an active-session checkpoint are
stored locally in this browser; there is no account or backend.

## Use the timer

- The ready screen shows the timer at full size, matching the active session.
  Use the top-right burger menu to choose a 5, 10, 15, 20, 30, or 45 minute
  preset, enter a whole number of minutes from 1 to 1,440, or edit warnings and
  theme. The default duration is 20 minutes; invalid input disables Start and
  shows an explanation. Select **Done**, press **Escape**, or click outside to
  close settings and return to the ready clock before starting.
- Starting a session closes settings and keeps the whole screen as the timer:
  a large status line, digits sized to fill the available width or height, a
  compact row of presenter controls, and a full-width progress bar along the
  bottom edge. Warning colors fill the whole screen. Settings stay hidden in
  setup and while paused or recovering a saved session. Open the burger menu
  to edit settings without pausing the timer. Select **Done**, press **Escape**,
  or click outside to close settings. Reset returns to the ready screen with
  settings hidden.
- **Pause timer** freezes elapsed time and warnings. Resume continues from that
  exact point; paused time never counts.
- Change the duration to set a new total, not to add time. The timer recomputes
  countdown/overtime and the applicable warning. A paused session stays paused.
- **Reset** asks for confirmation before returning to setup. It keeps the
  selected duration, theme, and warning schedule.
- Select **Warning settings** to edit the three descending countdown thresholds
  and four ascending overtime milestones in whole minutes. Invalid or
  duplicate values are explained and not applied. Defaults are 5, 2, and
  1 minute remaining, then 1, 3, 5, and 10 minutes overtime.
- Choose **System**, **Light**, or **Dark** for the theme. Warnings use text as
  well as color and do not use sound or vibration.

## Timing and warnings

Live timing uses elapsed `performance.now()` timestamps, not a count of refresh
callbacks. Pause freezes the exact elapsed time; resume excludes the paused
interval. Extending the total duration beyond elapsed time returns an overtime
session to countdown.

The display uses `MM:SS` below one hour and `H:MM:SS` at or above one hour.
Positive remaining time rounds up so zero is never shown before the deadline.
At the deadline, the display shows `+00:00` and **TIME'S UP**; after one full
overtime second it shows `+00:01`. Progress caps at 100% in overtime.

Countdown thresholds greater than the total duration are skipped. Warnings
advance to the highest applicable level, including immediately after returning
from the background, without replaying intermediate warnings. Duration and
warning-setting changes recompute the level and labels using the configured
thresholds. Warnings must not flash or shift the timer and controls.

## Screen and browser controls

While the timer is active, the app requests the Screen Wake Lock where the
browser supports it. It releases the lock when paused, reset, hidden, or when
the page is being left, then requests it again on return while the timer is
active. A denial, unsupported browser, or unexpected release does not stop the
timer; the app shows **Screen may sleep** beside the session controls, with the
full reason in the settings panel. Pause and resume to retry after a
denial or unexpected release. Browser power policies can still dim or lock a
device.

**Enter full screen** is shown only when the browser exposes its native
Full Screen API. Entry is a button action; Escape or the browser's own controls
can exit. Full-screen errors are reported in the app, and entering or leaving
full screen never pauses or resets the session. Browser permissions and
platform restrictions may prevent either optional capability.

## Local preview

Serve the static site over HTTP locally, for example with Python 3:

```sh
python3 -m http.server 8000 --directory site
```

Open <http://localhost:8000>. No dependencies, build step, bundler, or
automated test suite is required. The site should be served over HTTPS in
production; `localhost` is treated as a secure context by browsers for APIs
that require one.

## Local storage and recovery

The app saves the selected theme, warning schedule, last valid duration, and a
checkpoint of the current paused or active session in browser local storage.
Reset clears the saved active session but retains preferences and duration.
Paused sessions reload at their exact saved elapsed time. Active sessions add
the wall-clock time since the last checkpoint, then continue using the page's
monotonic timer clock. Checkpoints are refreshed periodically and when the
page is hidden or unloaded.

If the clock moved backward or an active-session checkpoint cannot be
reconciled, the app asks whether to restore the saved checkpoint paused or
discard it. Invalid saved sessions require returning to setup. Storage
access, quota, and invalid preference/duration problems are shown in the app;
the timer can continue even when saving fails, but reload recovery may then be
incomplete. Clearing this site's browser data also clears saved settings and
session state.

Changing the device clock does not affect a live timer. It can affect elapsed
time recovered after a reload: a backward change is detected and requires a
choice, but a forward change cannot always be distinguished from real elapsed
time.

## Manual browser validation

There is no automated test suite or build step. Before deployment, check:

- Default, preset, custom, and invalid durations; saved preferences; all themes.
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
  of active/paused sessions; the burger menu opens them without shrinking the
  timer. Check Done, Escape, outside clicks, warning-dialog focus restoration,
  and hidden settings after reset.
- Phone, tablet, and desktop layouts in portrait and landscape: readable
  digits that fill the session view for `MM:SS`, `+MM:SS`, and `H:MM:SS`,
  visible controls, no horizontal overflow or clipping, and warnings that do
  not disrupt the layout. Tablet timer views should need no scrolling.
  Orientation and full-screen changes must preserve the session.

Record what was checked and what remains unverified. Browser viewport emulation
is useful for layout checks but does not verify device-specific behavior such
as iPad Safari; actual iPad testing is not required.

## GitHub Pages

The [deployment workflow](./.github/workflows/deploy-pages.yml) publishes only
the contents of [site/](./site/) on pushes to `main`. It can also be run
manually from the repository's Actions tab after the workflow is on the
default branch.

In repository **Settings > Pages > Build and deployment**, the source must be
**GitHub Actions**. The workflow uses the built-in `GITHUB_TOKEN` and OpenID
Connect; no personal access token or repository secret is needed.

After a successful deployment, the site is available at
<https://rkondratowicz.github.io/presentation-timer/>.
