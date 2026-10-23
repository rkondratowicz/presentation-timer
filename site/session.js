export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 1440;
export const DEFAULT_DURATION_MINUTES = 20;
export const MINUTE_MS = 60_000;
export const DEFAULT_DURATION_MS = DEFAULT_DURATION_MINUTES * MINUTE_MS;

const ACTIVE_PHASES = new Set(["running", "overtime"]);
const SESSION_PHASES = new Set(["setup", "running", "paused", "overtime"]);

export function isValidDurationMs(durationMs) {
  const durationMinutes = durationMs / MINUTE_MS;
  return Number.isInteger(durationMinutes)
    && durationMinutes >= MIN_DURATION_MINUTES
    && durationMinutes <= MAX_DURATION_MINUTES;
}

export function createInitialSessionState(durationMs = DEFAULT_DURATION_MS) {
  if (!isValidDurationMs(durationMs)) {
    throw new RangeError("Duration must be a whole number of minutes from 1 to 1,440.");
  }
  return {
    phase: "setup",
    durationMs,
    elapsedMs: 0,
    startedAtMs: null,
  };
}

export function isValidSessionState(state) {
  if (!state || typeof state !== "object" || !SESSION_PHASES.has(state.phase)) return false;
  if (!isValidDurationMs(state.durationMs) || !Number.isFinite(state.elapsedMs) || state.elapsedMs < 0) return false;
  if (ACTIVE_PHASES.has(state.phase)) return Number.isFinite(state.startedAtMs);
  if (state.startedAtMs !== null) return false;
  return state.phase !== "setup" || state.elapsedMs === 0;
}

export function getElapsedMs(state, nowMs) {
  if (!ACTIVE_PHASES.has(state.phase)) return state.elapsedMs;
  if (!Number.isFinite(nowMs)) throw new TypeError("A finite monotonic timestamp is required.");
  return state.elapsedMs + Math.max(0, nowMs - state.startedAtMs);
}

function activePhaseFor(state, elapsedMs) {
  return elapsedMs >= state.durationMs ? "overtime" : "running";
}

export function startSession(state, nowMs) {
  if (state.phase !== "setup") return state;
  if (!Number.isFinite(nowMs)) throw new TypeError("A finite monotonic timestamp is required.");
  const nextState = { ...state, elapsedMs: 0, startedAtMs: nowMs };
  return { ...nextState, phase: activePhaseFor(nextState, 0) };
}

export function pauseSession(state, nowMs) {
  if (!ACTIVE_PHASES.has(state.phase)) return state;
  const elapsedMs = getElapsedMs(state, nowMs);
  return { ...state, phase: "paused", elapsedMs, startedAtMs: null };
}

export function resumeSession(state, nowMs) {
  if (state.phase !== "paused") return state;
  if (!Number.isFinite(nowMs)) throw new TypeError("A finite monotonic timestamp is required.");
  const nextState = { ...state, startedAtMs: nowMs };
  return { ...nextState, phase: activePhaseFor(nextState, state.elapsedMs) };
}

export function resetSession(state) {
  return createInitialSessionState(state.durationMs);
}

export function changeDuration(state, durationMs, nowMs) {
  if (!isValidDurationMs(durationMs)) return state;
  if (state.phase === "setup") return { ...state, durationMs };
  if (state.phase === "paused") return { ...state, durationMs };

  const elapsedMs = getElapsedMs(state, nowMs);
  const nextState = { ...state, durationMs, elapsedMs, startedAtMs: nowMs };
  return { ...nextState, phase: activePhaseFor(nextState, elapsedMs) };
}

export function synchronizePhase(state, nowMs) {
  if (!ACTIVE_PHASES.has(state.phase)) return state;
  const nextPhase = activePhaseFor(state, getElapsedMs(state, nowMs));
  return state.phase === nextPhase ? state : { ...state, phase: nextPhase };
}

function formatClock(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (totalSeconds >= 3600) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatCountdown(remainingMs) {
  return formatClock(Math.ceil(Math.max(0, remainingMs) / 1000));
}

export function formatOvertime(overtimeMs) {
  return `+${formatClock(Math.floor(Math.max(0, overtimeMs) / 1000))}`;
}

export function getTimerDisplay(state, nowMs) {
  const elapsedMs = getElapsedMs(state, nowMs);
  const isOvertime = elapsedMs >= state.durationMs;
  const remainingMs = Math.max(0, state.durationMs - elapsedMs);
  const timeText = isOvertime
    ? formatOvertime(elapsedMs - state.durationMs)
    : formatCountdown(remainingMs);
  let statusText = "ON TRACK";
  if (state.phase === "setup") statusText = "READY";
  else if (state.phase === "paused") statusText = isOvertime ? "PAUSED · OVERTIME" : "PAUSED";
  else if (isOvertime) statusText = "TIME'S UP";

  return {
    timeText,
    statusText,
    elapsedMs,
    isOvertime,
    progressPercent: Math.min(100, Math.max(0, (elapsedMs / state.durationMs) * 100)),
  };
}
