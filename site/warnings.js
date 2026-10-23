import { getElapsedMs, MINUTE_MS } from "./session.js";
import { DEFAULT_PREFERENCES } from "./preferences.js";

const COUNTDOWN_LABELS = ["", "WRAP UP"];
const OVERTIME_LABELS = ["OVERTIME", "TIME EXCEEDED", "STILL OVERTIME"];

export function getWarningDisplay(
  state,
  nowMs,
  schedule = DEFAULT_PREFERENCES.warnings,
) {
  if (state.phase === "setup") {
    return { warningKey: "on-track", statusText: "READY" };
  }

  const elapsedMs = getElapsedMs(state, nowMs);
  let warningKey = "on-track";
  let statusText = state.phase === "paused" ? "PAUSED" : "ON TRACK";
  if (elapsedMs < state.durationMs) {
    const remainingMs = state.durationMs - elapsedMs;
    for (let index = 0; index < schedule.countdownMinutes.length; index += 1) {
      const thresholdMinutes = schedule.countdownMinutes[index];
      if (thresholdMinutes * MINUTE_MS > state.durationMs) continue;
      if (remainingMs > thresholdMinutes * MINUTE_MS) continue;
      const stage = index + 1;
      warningKey = `countdown-${stage}`;
      if (stage === 1) statusText = `${thresholdMinutes} MIN LEFT`;
      else if (COUNTDOWN_LABELS[stage - 1]) statusText = COUNTDOWN_LABELS[stage - 1];
      else {
        statusText = thresholdMinutes === 1
          ? "FINAL MINUTE"
          : `FINAL ${thresholdMinutes} MINUTES`;
      }
    }
  } else {
    const overtimeMs = elapsedMs - state.durationMs;
    warningKey = "deadline";
    statusText = "TIME'S UP";
    for (let index = 0; index < schedule.overtimeMinutes.length; index += 1) {
      const thresholdMinutes = schedule.overtimeMinutes[index];
      if (overtimeMs < thresholdMinutes * MINUTE_MS) break;
      const stage = index + 1;
      warningKey = `overtime-${stage}`;
      statusText = OVERTIME_LABELS[index] ?? `OVERTIME +${thresholdMinutes} MIN`;
      if (index === schedule.overtimeMinutes.length - 1) {
        statusText = `OVERTIME +${thresholdMinutes} MIN`;
      }
    }
  }

  if (state.phase === "paused" && warningKey !== "on-track") {
    statusText = `PAUSED · ${statusText}`;
  }
  return { warningKey, statusText };
}
