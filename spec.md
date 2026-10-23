# Presentation Timer

A silent, tablet-first web timer: enter a duration, start a countdown, see increasingly prominent visual warnings, then count up in overtime.

## Stack and Scope

- Semantic HTML, CSS, and vanilla JavaScript ES modules.
- No UI framework, bundler, build step, or automated test suite/dependencies.
- Keep timing logic separate from DOM rendering and browser API integration.
- Serve static files over HTTPS. No backend or account; timing works without internet once the page is loaded.
- No native app, multiple timers, history, cloud sync, slide management, remote controls, sound, or vibration.

## Setup

- Title: "Presentation Timer".
- Duration: whole minutes from 1 to 1,440 (24 hours), default 20.
- Presets: 5, 10, 15, 20, 30, and 45 minutes; custom entry always available.
- Start is the primary action. Invalid input disables Start and shows an explanation.
- Advanced warning settings are collapsed by default.
- Theme selector is available outside advanced settings: system (default), dark, light.
- Save preferences and last valid duration locally.

## Timer View and Controls

- Large, centered digits, an always-visible status label, and touch-friendly controls.
- Responsive layouts must work in both portrait and landscape across phone, tablet, and desktop viewports, without horizontal overflow or clipped controls.
- Portrait and landscape tablet layouts require no scrolling. Settings must not obscure the timer.
- Progress represents elapsed time, capped at 100% during overtime.
- Pause/resume is primary; reset is secondary.
- Theme changes apply immediately without affecting timing.
- Orientation changes and leaving full screen preserve the session.

| Action | Behavior |
|---|---|
| Start | Begin counting elapsed time against the selected duration. |
| Pause | Freeze exact elapsed time and warning state, including during overtime. |
| Resume | Continue from frozen elapsed time; paused time never accrues. |
| Reset | Confirm before resetting a running, overtime, or paused session; return to setup and retain preferences. |
| Change duration | Set the total allowed time, not additional time. Recompute countdown/overtime and warnings. Stay paused if paused. |

Example: after 12 minutes of a 20-minute session, changing the duration to 25 minutes leaves 13 minutes.

States: `setup`, `running`, `paused`, `overtime`. At elapsed time >= duration, an active timer enters overtime; extending the duration beyond elapsed time returns it to countdown.

## Display and Warnings

- Use `MM:SS` below one hour and `H:MM:SS` at or above one hour, for both countdown and overtime.
- Round positive remaining time up to whole seconds: never show zero before the deadline.
- At the deadline show `+00:00` and `TIME'S UP`; after one full overtime second show `+00:01`.
- Overtime continues until paused, reset, or the duration is extended beyond elapsed time.

Default warning schedule:

| Trigger | Visual treatment | Status |
|---|---|---|
| Before the first applicable warning | Normal theme, green progress | `ON TRACK` |
| 5 minutes remaining | Amber accent, more prominent digits | `5 MIN LEFT` |
| 2 minutes remaining | Amber background tint, stronger label | `WRAP UP` |
| 1 minute remaining | High-contrast amber, prominent digits | `FINAL MINUTE` |
| Deadline | Red background, high-contrast digits | `TIME'S UP` |
| +1 minute | Strong red accent, overtime banner | `OVERTIME` |
| +3 minutes | Stronger contrast, larger warning text | `TIME EXCEEDED` |
| +5 minutes | Maximum emphasis | `STILL OVERTIME` |
| +10 minutes | Maintain maximum emphasis | `OVERTIME +10 MIN` |

- Warnings use text as well as color. Use short, smooth transitions; no flashing, continuous animation, or shifts in digit/control positions.
- Skip countdown thresholds greater than the total duration.
- Retain reached urgency until reset or a duration/threshold change.
- After backgrounding, apply the highest applicable warning immediately; do not replay intermediate warnings.
- Allow configuration of the three countdown thresholds and four overtime milestones in whole minutes only. Countdown thresholds must be positive and strictly descending; overtime milestones positive, unique, and ascending. Reject invalid settings with an explanation.
- Recompute warnings after duration/threshold changes without replaying earlier effects. Labels must reflect configured thresholds rather than hard-coded defaults.

## Timing and Recovery

- Derive time from elapsed timestamps, never by counting interval callbacks. Intervals or animation frames only refresh the display.
- Use `performance.now()` during a live page session; preserve accumulated elapsed time across pause/resume.
- Refresh immediately on return to visibility and on `pageshow`, including back-forward cache restoration. Do not rely on background callbacks.
- Persist session state with a wall-clock checkpoint for reload/process-termination recovery. Never reuse a monotonic timestamp across reloads.
- Restore paused sessions without adding elapsed time; reconcile active sessions with time passed since the checkpoint.
- If recovery is uncertain but a trustworthy elapsed-time checkpoint exists, offer to restore that elapsed time as paused or discard the session. Do not silently reset or add uncertain elapsed time.
- If saved session data is invalid or corrupt, explain the problem and allow returning to setup rather than attempting an unsafe restoration.
- Device clock changes must not affect live timing; document that they can affect recovery after reload.
- Surface persistence failures without stopping the timer.

## Screen Wake and Full Screen

- Request Screen Wake Lock while running or in overtime; release on pause/reset and re-request when returning to visibility.
- If unsupported, denied, or released while visible, keep timing and indicate that the device may sleep.
- Full-screen entry is user-initiated and available only where supported. Exiting does not pause or reset.

## Manual Validation

The implementation assistant manually checks behavior in the browser, using interactive browser tools where available. No automated test suite.

- [ ] Default/custom/preset durations, invalid input, saved preferences, and all themes.
- [ ] Countdown formatting and rounding, zero transition, and overtime formatting.
- [ ] Pause/resume before and after zero; no elapsed time or warning advancement while paused.
- [ ] Reset confirmation and duration changes during countdown, overtime, and pause.
- [ ] Default/custom thresholds, skipped thresholds, and multiple thresholds crossed while backgrounded.
- [ ] Background/return, reload recovery, and back-forward navigation.
- [ ] Responsive phone, tablet, and desktop layouts in portrait and landscape: readable digits, visible controls, no horizontal overflow or clipping, and non-disruptive warnings. Tablet timer views require no scrolling.
- [ ] Switching between portrait and landscape preserves the session and keeps the timer and controls usable.
- [ ] Wake-lock/full-screen success, denial, release, and unsupported behavior.

Record results and unverified scenarios. Browser viewport resizing or emulation is sufficient for responsive layout checks; actual iPad Safari testing is not required. Do not claim device-specific behavior was verified through desktop checks.
