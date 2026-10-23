import {
  MINUTE_MS,
} from "./session.js";

export const DEFAULT_COUNTDOWN_WARNINGS = Object.freeze([5, 2, 1]);
export const DEFAULT_OVERTIME_MILESTONES = Object.freeze([1, 3, 5, 10]);

export const DEFAULT_PREFERENCES = Object.freeze({
  version: 1,
  theme: "system",
  warnings: Object.freeze({
    countdownMinutes: DEFAULT_COUNTDOWN_WARNINGS,
    overtimeMinutes: DEFAULT_OVERTIME_MILESTONES,
  }),
});

const THEMES = new Set(["system", "dark", "light"]);

export function createDefaultPreferences() {
  return {
    version: DEFAULT_PREFERENCES.version,
    theme: DEFAULT_PREFERENCES.theme,
    warnings: {
      countdownMinutes: [...DEFAULT_COUNTDOWN_WARNINGS],
      overtimeMinutes: [...DEFAULT_OVERTIME_MILESTONES],
    },
  };
}

export function validateWarningSchedule(countdownMinutes, overtimeMinutes) {
  const schedules = [
    ["countdown", countdownMinutes, DEFAULT_COUNTDOWN_WARNINGS.length],
    ["overtime", overtimeMinutes, DEFAULT_OVERTIME_MILESTONES.length],
  ];
  for (const [name, values, expectedLength] of schedules) {
    if (!Array.isArray(values) || values.length !== expectedLength
      || !values.every((minutes) => Number.isSafeInteger(minutes)
        && minutes > 0
        && Number.isSafeInteger(minutes * MINUTE_MS))) {
      return {
        valid: false,
        error: "All warning thresholds must be whole positive minutes within the safe timer range.",
      };
    }
    if (name === "countdown" && !values.every((minutes, index) => (
      index === 0 || values[index - 1] > minutes
    ))) {
      return {
        valid: false,
        error: "Countdown warnings must descend (first > second > final), for example 5, 2, 1.",
      };
    }
    if (name === "overtime" && !values.every((minutes, index) => (
      index === 0 || values[index - 1] < minutes
    ))) {
      return {
        valid: false,
        error: "Overtime milestones must be unique and ascending, for example 1, 3, 5, 10.",
      };
    }
  }
  return {
    valid: true,
    value: {
      countdownMinutes: [...countdownMinutes],
      overtimeMinutes: [...overtimeMinutes],
    },
  };
}

export function validatePreferences(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, error: "Preferences must be an object." };
  }
  if (candidate.version !== DEFAULT_PREFERENCES.version) {
    return { valid: false, error: "This preference version is not supported." };
  }
  if (!THEMES.has(candidate.theme)) {
    return { valid: false, error: "Choose system, dark, or light theme." };
  }
  const warnings = candidate.warnings;
  const warningResult = validateWarningSchedule(
    warnings?.countdownMinutes,
    warnings?.overtimeMinutes,
  );
  if (!warningResult.valid) return warningResult;
  return {
    valid: true,
    value: {
      version: DEFAULT_PREFERENCES.version,
      theme: candidate.theme,
      warnings: warningResult.value,
    },
  };
}
