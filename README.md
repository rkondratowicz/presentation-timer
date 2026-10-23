# Presentation Timer

A silent, tablet-first presentation timer with a countdown, configurable visual
warnings, overtime display, pause/resume, total-duration editing, and
system/light/dark themes. Preferences and an active-session checkpoint are
stored locally in this browser; there is no account or backend.

## Use the timer

- Choose a preset or enter a whole number of minutes from 1 to 1,440, then
  select **Start timer**.
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

## Screen and browser controls

While the timer is active, the app requests the Screen Wake Lock where the
browser supports it. It releases the lock when paused, reset, hidden, or when
the page is being left, then requests it again on return while the timer is
active. A denial, unsupported browser, or unexpected release does not stop the
timer; the app says the device may sleep. Pause and resume to retry after a
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

There is no automated test suite or build step. Validate timer boundaries,
pause/resume, warning settings, reset and duration changes, reload/background
recovery, capability availability/failure, keyboard operation, and responsive
layouts in portrait and landscape before deployment. Browser viewport
emulation is useful for layout checks but does not verify device-specific
behavior such as iPad Safari.

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
