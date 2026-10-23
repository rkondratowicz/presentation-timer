import { isValidDurationMs } from "./session.js";
import { validatePreferences } from "./preferences.js";

export const PERSISTENCE_VERSION = 1;
export const PREFERENCES_STORAGE_KEY = "presentation-timer.preferences.v1";
export const DURATION_STORAGE_KEY = "presentation-timer.duration.v1";
export const SESSION_STORAGE_KEY = "presentation-timer.session.v1";

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => keys.includes(key));
}

function isValidPersistedDurationMs(durationMs) {
  return typeof durationMs === "number"
    && Number.isSafeInteger(durationMs)
    && isValidDurationMs(durationMs);
}

export function validatePersistedPreferences(candidate) {
  if (!hasExactKeys(candidate, ["version", "theme", "warnings"])) {
    return { valid: false, error: "Saved preferences have an invalid shape." };
  }
  const warningKeys = ["countdownMinutes", "overtimeMinutes"];
  if (!hasExactKeys(candidate.warnings, warningKeys)) {
    return { valid: false, error: "Saved warning settings have an invalid shape." };
  }
  return validatePreferences(candidate);
}

export function createPersistedDuration(durationMs) {
  if (!isValidPersistedDurationMs(durationMs)) {
    throw new RangeError("Only a valid whole-minute duration can be saved.");
  }
  return { version: PERSISTENCE_VERSION, durationMs };
}

export function validatePersistedDuration(candidate) {
  if (!hasExactKeys(candidate, ["version", "durationMs"])) {
    return { valid: false, error: "Saved duration has an invalid shape." };
  }
  if (candidate.version !== PERSISTENCE_VERSION) {
    return { valid: false, error: "This saved duration version is not supported." };
  }
  if (!isValidPersistedDurationMs(candidate.durationMs)) {
    return { valid: false, error: "Saved duration must be a whole number of minutes from 1 to 1,440." };
  }
  return { valid: true, value: { version: PERSISTENCE_VERSION, durationMs: candidate.durationMs } };
}

export function createSessionCheckpoint(session, checkpointAtMs) {
  if (!session || !["running", "overtime", "paused"].includes(session.phase)
    || !isValidPersistedDurationMs(session.durationMs)
    || !Number.isFinite(session.elapsedMs)
    || session.elapsedMs < 0
    || session.elapsedMs > Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(checkpointAtMs)
    || checkpointAtMs < 0) {
    throw new TypeError("The session cannot be saved as a valid checkpoint.");
  }
  if ((session.phase === "running" && session.elapsedMs >= session.durationMs)
    || (session.phase === "overtime" && session.elapsedMs < session.durationMs)) {
    throw new TypeError("Session phase does not match its elapsed time.");
  }
  return {
    version: PERSISTENCE_VERSION,
    phase: session.phase,
    durationMs: session.durationMs,
    elapsedMs: session.elapsedMs,
    checkpointAtMs,
  };
}

export function validateSessionCheckpoint(candidate) {
  const requiredKeys = ["version", "phase", "durationMs", "elapsedMs"];
  const allowedKeys = [...requiredKeys, "checkpointAtMs"];
  if (!candidate
    || typeof candidate !== "object"
    || Array.isArray(candidate)
    || !requiredKeys.every((key) => Object.hasOwn(candidate, key))
    || Object.keys(candidate).some((key) => !allowedKeys.includes(key))) {
    return { valid: false, error: "Saved session has an invalid shape." };
  }
  if (candidate.version !== PERSISTENCE_VERSION) {
    return { valid: false, error: "This saved session version is not supported." };
  }
  if (!["running", "overtime", "paused"].includes(candidate.phase)) {
    return { valid: false, error: "Saved session phase is not supported." };
  }
  if (!isValidPersistedDurationMs(candidate.durationMs)) {
    return { valid: false, error: "Saved session duration is invalid." };
  }
  if (!Number.isFinite(candidate.elapsedMs)
    || candidate.elapsedMs < 0
    || candidate.elapsedMs > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: "Saved elapsed time is invalid." };
  }
  if ((candidate.phase === "running" && candidate.elapsedMs >= candidate.durationMs)
    || (candidate.phase === "overtime" && candidate.elapsedMs < candidate.durationMs)) {
    return { valid: false, error: "Saved phase and elapsed time do not agree." };
  }

  const checkpointAtIsValid = Object.hasOwn(candidate, "checkpointAtMs")
    && Number.isSafeInteger(candidate.checkpointAtMs)
    && candidate.checkpointAtMs >= 0;
  return {
    valid: true,
    value: {
      version: PERSISTENCE_VERSION,
      phase: candidate.phase,
      durationMs: candidate.durationMs,
      elapsedMs: candidate.elapsedMs,
      checkpointAtMs: checkpointAtIsValid ? candidate.checkpointAtMs : null,
    },
    checkpointAtIsValid,
  };
}

export function recoverSessionCheckpoint(candidate, nowWallMs, nowPerformanceMs) {
  const validation = validateSessionCheckpoint(candidate);
  if (!validation.valid) return { outcome: "invalid", error: validation.error };

  const saved = validation.value;
  if (saved.phase === "paused") {
    return {
      outcome: "restored",
      session: {
        phase: "paused",
        durationMs: saved.durationMs,
        elapsedMs: saved.elapsedMs,
        startedAtMs: null,
      },
    };
  }

  if (!validation.checkpointAtIsValid
    || !Number.isSafeInteger(nowWallMs)
    || nowWallMs < saved.checkpointAtMs
    || !Number.isFinite(nowPerformanceMs)) {
    return {
      outcome: "uncertain",
      checkpoint: saved,
      reason: "The wall-clock checkpoint cannot be safely reconciled.",
    };
  }

  const elapsedMs = saved.elapsedMs + (nowWallMs - saved.checkpointAtMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs > Number.MAX_SAFE_INTEGER) {
    return {
      outcome: "uncertain",
      checkpoint: saved,
      reason: "The recovered elapsed time is outside the safe timer range.",
    };
  }
  return {
    outcome: "restored",
    session: {
      phase: elapsedMs >= saved.durationMs ? "overtime" : "running",
      durationMs: saved.durationMs,
      elapsedMs,
      startedAtMs: nowPerformanceMs,
    },
  };
}

export function restoreCheckpointPaused(checkpoint) {
  const validation = validateSessionCheckpoint(checkpoint);
  if (!validation.valid) {
    throw new TypeError("Only a valid elapsed-time checkpoint can be restored paused.");
  }
  return {
    phase: "paused",
    durationMs: validation.value.durationMs,
    elapsedMs: validation.value.elapsedMs,
    startedAtMs: null,
  };
}
