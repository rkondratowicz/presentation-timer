import {
  MINUTE_MS,
  changeDuration,
  createInitialSessionState,
  getElapsedMs,
  getTimerDisplay,
  pauseSession,
  resetSession,
  resumeSession,
  startSession,
  synchronizePhase,
} from "./session.js";
import {
  createDefaultPreferences,
  DEFAULT_PREFERENCES,
  validatePreferences,
  validateWarningSchedule,
} from "./preferences.js";
import { getWarningDisplay } from "./warnings.js";
import { createBrowserCapabilities } from "./browser-capabilities.js";
import {
  createPersistedDuration,
  createSessionCheckpoint,
  DURATION_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  recoverSessionCheckpoint,
  restoreCheckpointPaused,
  SESSION_STORAGE_KEY,
  validatePersistedDuration,
  validatePersistedPreferences,
  validateSessionCheckpoint,
} from "./persistence.js";

const root = document.documentElement;
const timerPanel = document.querySelector(".timer-panel");
const settingsPanel = document.querySelector("#settings-panel");
const settingsAction = document.querySelector("#settings-action");
const settingsCloseAction = document.querySelector("#settings-close-action");
const statusElement = document.querySelector("#session-status");
const timerElement = document.querySelector("#timer-display");
const progressElement = document.querySelector("#session-progress");
const primaryAction = document.querySelector("#primary-action");
const resetAction = document.querySelector("#reset-action");
const fullscreenAction = document.querySelector("#fullscreen-action");
const wakeLockSummary = document.querySelector("#wake-lock-summary");
const wakeLockDetail = document.querySelector("#wake-lock-detail");
const fullscreenNotice = document.querySelector("#fullscreen-notice");
const durationForm = document.querySelector("#duration-form");
const durationInput = document.querySelector("#duration-input");
const durationError = document.querySelector("#duration-error");
const durationSubmit = document.querySelector("#duration-submit");
const durationNote = document.querySelector("#duration-note");
const themeSelect = document.querySelector("#theme-select");
const resetDialog = document.querySelector("#reset-dialog");
const warningSettingsAction = document.querySelector("#warning-settings-action");
const warningDialog = document.querySelector("#warning-dialog");
const warningForm = document.querySelector("#warning-form");
const warningError = document.querySelector("#warning-error");
const warningDefaultsAction = document.querySelector("#warning-defaults");
const warningCancelAction = document.querySelector("#warning-cancel");
const persistenceNotice = document.querySelector("#persistence-notice");
const persistenceNoticeList = document.querySelector("#persistence-notice-list");
const persistenceRetryAction = document.querySelector("#persistence-retry");
const recoveryDialog = document.querySelector("#recovery-dialog");
const recoveryTitle = document.querySelector("#recovery-title");
const recoveryDescription = document.querySelector("#recovery-description");
const recoveryRestoreAction = document.querySelector("#recovery-restore");
const recoveryDiscardAction = document.querySelector("#recovery-discard");
const recoveryReturnAction = document.querySelector("#recovery-return");

let session = createInitialSessionState();
let preferences = createDefaultPreferences();
let refreshIntervalId = null;
let resetTrigger = null;
let warningSettingsTrigger = null;
let durationWasTouched = false;
let settingsAreOpen = false;
let storage = null;
let sessionWritesBlocked = false;
let preferencesWritesBlocked = false;
let durationWritesBlocked = false;
let pendingSessionRemoval = false;
let lastCheckpointPerfMs = null;
let recoveryCheckpoint = null;
let lastFullscreenActive = false;
let restoreFullscreenFocus = false;
let fullscreenActionWasFocused = false;
const notices = new Map();

function updateCapabilityControls(state) {
  wakeLockSummary.textContent = state.wakeLockSummary;
  wakeLockDetail.textContent = state.wakeLockMessage;
  fullscreenAction.hidden = !state.fullscreenSupported;
  fullscreenAction.textContent = state.fullscreenActive ? "Exit full screen" : "Enter full screen";
  fullscreenAction.setAttribute("aria-label", fullscreenAction.textContent);
  fullscreenAction.disabled = state.fullscreenPending;
  fullscreenAction.setAttribute("aria-busy", String(state.fullscreenPending));
  fullscreenNotice.textContent = state.fullscreenNotice;

  const fullscreenChanged = state.fullscreenActive !== lastFullscreenActive;
  if (fullscreenChanged) {
    const shouldRestoreFocus = restoreFullscreenFocus
      || (!state.fullscreenActive && lastFullscreenActive && fullscreenActionWasFocused);
    lastFullscreenActive = state.fullscreenActive;
    restoreFullscreenFocus = false;
    if (shouldRestoreFocus && document.activeElement !== fullscreenAction) {
      fullscreenAction.focus({ preventScroll: true });
    }
    if (!state.fullscreenActive) fullscreenActionWasFocused = false;
  } else if (!state.fullscreenPending) {
    restoreFullscreenFocus = false;
  }
}

function trackFullscreenFocus(event) {
  if (document.fullscreenElement) {
    fullscreenActionWasFocused = event.target === fullscreenAction;
  }
}

const browserCapabilities = createBrowserCapabilities({
  documentObject: document,
  navigatorObject: navigator,
  onChange: updateCapabilityControls,
});

const countdownInputs = [
  document.querySelector("#countdown-first"),
  document.querySelector("#countdown-second"),
  document.querySelector("#countdown-final"),
];
const overtimeInputs = [
  document.querySelector("#overtime-first"),
  document.querySelector("#overtime-second"),
  document.querySelector("#overtime-third"),
  document.querySelector("#overtime-fourth"),
];

function updatePersistenceNotice() {
  persistenceNoticeList.replaceChildren();
  for (const { message } of notices.values()) {
    const item = document.createElement("li");
    item.textContent = message;
    persistenceNoticeList.append(item);
  }
  persistenceNotice.hidden = notices.size === 0;
  persistenceRetryAction.hidden = ![...notices.values()].some((notice) => notice.retryType);
}

function setNotice(key, message, retryType = null) {
  notices.set(key, { message, retryType });
  updatePersistenceNotice();
}

function clearNotice(key) {
  if (notices.delete(key)) updatePersistenceNotice();
}

function storageErrorName(error) {
  return error instanceof Error && error.name ? error.name : "storage error";
}

function wallTimeForRecovery() {
  try {
    return Date.now();
  } catch {
    return Number.NaN;
  }
}

function readStoredValue(key, label, validator) {
  if (!storage) return { status: "unavailable" };
  let raw;
  try {
    raw = storage.getItem(key);
  } catch (error) {
    return { status: "error", error: `Browser storage could not read ${label} (${storageErrorName(error)}).` };
  }
  if (raw === null) {
    clearNotice(`read-${key}`);
    return { status: "missing" };
  }

  let candidate;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return { status: "invalid", error: "Saved data is not valid JSON." };
  }
  const result = validator(candidate);
  return result.valid
    ? { status: "valid", value: result.value }
    : { status: "invalid", error: result.error };
}

function writeStoredValue(key, value, label) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    clearNotice(`read-${key}`);
    clearNotice(`invalid-${key}`);
    clearNotice(`write-${key}`);
    if (key === PREFERENCES_STORAGE_KEY) {
      clearNotice("invalid-preferences");
      clearNotice("error-preferences");
    } else if (key === DURATION_STORAGE_KEY) {
      clearNotice("invalid-duration");
      clearNotice("error-duration");
    }
    return true;
  } catch (error) {
    setNotice(
      `write-${key}`,
      `Could not save ${label} (${storageErrorName(error)}). The timer keeps running, but a reload may lose this change. Check this site's storage access or free space, then retry.`,
      key,
    );
    return false;
  }
}

function persistPreferences() {
  if (preferencesWritesBlocked) return false;
  return writeStoredValue(PREFERENCES_STORAGE_KEY, preferences, "preferences");
}

function persistDuration() {
  if (durationWritesBlocked) return false;
  return writeStoredValue(
    DURATION_STORAGE_KEY,
    createPersistedDuration(session.durationMs),
    "the last valid duration",
  );
}

function persistSessionCheckpoint(nowPerformanceMs = performance.now()) {
  if (session.phase === "setup" || sessionWritesBlocked || !storage) return false;
  try {
    const elapsedMs = session.phase === "paused"
      ? session.elapsedMs
      : getElapsedMs(session, nowPerformanceMs);
    const checkpointSession = session.phase === "paused"
      ? session
      : {
        ...session,
        phase: elapsedMs >= session.durationMs ? "overtime" : "running",
        elapsedMs,
      };
    const checkpoint = createSessionCheckpoint(checkpointSession, Date.now());
    lastCheckpointPerfMs = nowPerformanceMs;
    return writeStoredValue(SESSION_STORAGE_KEY, checkpoint, "the session checkpoint");
  } catch (error) {
    lastCheckpointPerfMs = nowPerformanceMs;
    setNotice(
      `write-${SESSION_STORAGE_KEY}`,
      `Could not create a safe session checkpoint (${storageErrorName(error)}). The timer keeps running, but a reload may not recover it.`,
      SESSION_STORAGE_KEY,
    );
    return false;
  }
}

function removeSavedSession() {
  if (!storage) return false;
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
    pendingSessionRemoval = false;
    sessionWritesBlocked = false;
    clearNotice(`read-${SESSION_STORAGE_KEY}`);
    clearNotice(`invalid-${SESSION_STORAGE_KEY}`);
    clearNotice(`write-${SESSION_STORAGE_KEY}`);
    return true;
  } catch (error) {
    pendingSessionRemoval = true;
    sessionWritesBlocked = true;
    setNotice(
      `write-${SESSION_STORAGE_KEY}`,
      `Could not clear the saved session (${storageErrorName(error)}). It has not been replaced; check this site's storage access and retry clearing it.`,
      SESSION_STORAGE_KEY,
    );
    return false;
  }
}

function retryPersistence() {
  if (pendingSessionRemoval) removeSavedSession();
  const retryTypes = new Set(
    [...notices.values()].map((notice) => notice.retryType).filter(Boolean),
  );
  if (retryTypes.has(PREFERENCES_STORAGE_KEY)) persistPreferences();
  if (retryTypes.has(DURATION_STORAGE_KEY)) persistDuration();
  if (retryTypes.has(SESSION_STORAGE_KEY) && !pendingSessionRemoval) {
    persistSessionCheckpoint(performance.now());
  }
}

function showRecoveryDialog(kind, message, checkpoint = null) {
  recoveryCheckpoint = checkpoint;
  recoveryTitle.textContent = kind === "uncertain"
    ? "Session time is uncertain"
    : "Saved session cannot be restored";
  recoveryDescription.textContent = message;
  recoveryRestoreAction.hidden = kind !== "uncertain";
  recoveryDiscardAction.hidden = kind !== "uncertain";
  recoveryReturnAction.hidden = kind === "uncertain";
  recoveryDialog.showModal();
}

function loadPersistedState() {
  try {
    storage = window.localStorage;
    if (!storage
      || typeof storage.getItem !== "function"
      || typeof storage.setItem !== "function"
      || typeof storage.removeItem !== "function") {
      throw new TypeError("Storage methods are unavailable.");
    }
  } catch (error) {
    sessionWritesBlocked = true;
    preferencesWritesBlocked = true;
    durationWritesBlocked = true;
    setNotice(
      "storage-access",
      `Browser storage is unavailable (${storageErrorName(error)}). Defaults are active and no session was restored. Allow storage for this site and reload; the timer can still run.`,
    );
    return;
  }

  const savedPreferences = readStoredValue(
    PREFERENCES_STORAGE_KEY,
    "saved preferences",
    validatePersistedPreferences,
  );
  if (savedPreferences.status === "valid") {
    preferences = savedPreferences.value;
  } else if (savedPreferences.status === "invalid" || savedPreferences.status === "error") {
    preferencesWritesBlocked = true;
    setNotice(
      `${savedPreferences.status}-preferences`,
      savedPreferences.status === "invalid"
        ? `Saved preferences are unusable: ${savedPreferences.error} Defaults are active; change the theme or warning settings to replace them.`
        : `${savedPreferences.error} Defaults are active. Allow storage and reload, or change preferences to save new settings.`,
    );
  }

  const savedDuration = readStoredValue(
    DURATION_STORAGE_KEY,
    "saved duration",
    validatePersistedDuration,
  );
  if (savedDuration.status === "valid") {
    session = createInitialSessionState(savedDuration.value.durationMs);
  } else if (savedDuration.status === "invalid" || savedDuration.status === "error") {
    durationWritesBlocked = true;
    setNotice(
      `${savedDuration.status}-duration`,
      savedDuration.status === "invalid"
        ? `Saved duration is unusable: ${savedDuration.error} The 20-minute default is active; choose a duration to replace it.`
        : `${savedDuration.error} The 20-minute default is active. Allow storage and reload, or choose a duration to save a new value.`,
    );
  }

  const savedSession = readStoredValue(
    SESSION_STORAGE_KEY,
    "saved session",
    validateSessionCheckpoint,
  );
  if (savedSession.status === "error") {
    sessionWritesBlocked = true;
    setNotice(
      `read-${SESSION_STORAGE_KEY}`,
      `${savedSession.error} Setup remains available, but no session was restored or replaced. Allow storage and reload.`,
    );
    return;
  }
  if (savedSession.status === "invalid") {
    sessionWritesBlocked = true;
    showRecoveryDialog(
      "invalid",
      `The saved session is invalid or unsupported: ${savedSession.error} You can safely return to setup; this session will not be restored.`,
    );
    return;
  }
  if (savedSession.status !== "valid") return;

  const recovery = recoverSessionCheckpoint(
    savedSession.value,
    wallTimeForRecovery(),
    performance.now(),
  );
  if (recovery.outcome === "restored") {
    session = recovery.session;
    if (session.phase !== "paused") persistSessionCheckpoint(session.startedAtMs);
  } else if (recovery.outcome === "uncertain") {
    sessionWritesBlocked = true;
    showRecoveryDialog(
      "uncertain",
      `${recovery.reason} The saved elapsed checkpoint is ${Math.floor(recovery.checkpoint.elapsedMs / 1000)} seconds. Restore that checkpoint paused, or discard the saved session. No time will be added unless the clock delta is trustworthy.`,
      recovery.checkpoint,
    );
  } else {
    sessionWritesBlocked = true;
    showRecoveryDialog(
      "invalid",
      `The saved session is invalid or unsupported: ${recovery.error} You can safely return to setup; this session will not be restored.`,
    );
  }
}

function getInputDurationMs() {
  if (!durationInput.validity.valid || durationInput.value.trim() === "") return null;
  const minutes = durationInput.valueAsNumber;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
  return minutes * MINUTE_MS;
}

function updateDurationFieldError() {
  const durationMs = getInputDurationMs();
  const showError = durationWasTouched && durationMs === null;
  durationError.textContent = showError
    ? "Enter a whole number from 1 to 1,440 minutes."
    : "";
  durationInput.setAttribute("aria-invalid", String(showError));
  primaryAction.disabled = session.phase === "setup" && durationMs === null;
  durationSubmit.disabled = durationMs === null;
}

function updatePresetSelection() {
  const selectedMinutes = session.durationMs / MINUTE_MS;
  for (const button of document.querySelectorAll(".preset-button")) {
    const selected = Number(button.dataset.minutes) === selectedMinutes;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function renderSettings() {
  const isSetup = session.phase === "setup";
  root.dataset.sessionActive = String(!isSetup);
  settingsPanel.hidden = !isSetup && !settingsAreOpen;
  settingsAction.hidden = isSetup;
  settingsCloseAction.hidden = isSetup;
  settingsAction.setAttribute("aria-expanded", String(settingsAreOpen));
  settingsAction.setAttribute("aria-label", settingsAreOpen ? "Close settings" : "Open settings");
}

function setSettingsOpen(isOpen, { restoreFocus = false } = {}) {
  settingsAreOpen = isOpen;
  renderSettings();
  if (isOpen) durationInput.focus({ preventScroll: true });
  else if (restoreFocus) settingsAction.focus({ preventScroll: true });
}

function render(nowMs = performance.now(), { syncDurationField = false } = {}) {
  session = synchronizePhase(session, nowMs);
  const display = getTimerDisplay(session, nowMs);
  const warning = getWarningDisplay(session, nowMs, preferences.warnings);
  timerElement.textContent = display.timeText;
  timerElement.style.setProperty("--timer-characters", String(display.timeText.length));
  if (statusElement.textContent !== warning.statusText) {
    statusElement.textContent = warning.statusText;
  }
  progressElement.value = display.progressPercent;
  timerPanel.dataset.phase = session.phase;
  timerPanel.dataset.overtime = String(display.isOvertime);
  timerPanel.dataset.warning = warning.warningKey;

  primaryAction.textContent = session.phase === "setup"
    ? "Start timer"
    : session.phase === "paused"
      ? "Resume timer"
      : "Pause timer";
  primaryAction.setAttribute("aria-label", primaryAction.textContent);
  resetAction.disabled = session.phase === "setup";
  durationSubmit.hidden = session.phase === "setup";
  durationSubmit.textContent = "Apply total time";
  durationNote.textContent = session.phase === "setup"
    ? "Your presentation timer is ready when you are."
    : session.phase === "paused"
      ? "Changes update the total time. The session will stay paused."
      : "Changes update the total time; paused time never counts.";

  if (syncDurationField) durationInput.value = String(session.durationMs / MINUTE_MS);
  renderSettings();
  updatePresetSelection();
  updateDurationFieldError();
  updateRefreshInterval();
}

function updateRefreshInterval() {
  const isActive = (session.phase === "running" || session.phase === "overtime") && !document.hidden;
  if (isActive && refreshIntervalId === null) {
    refreshIntervalId = window.setInterval(refreshActiveSession, 200);
  } else if (!isActive && refreshIntervalId !== null) {
    window.clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

function syncWakeLockForSession(isPageVisible = !document.hidden) {
  const isActive = session.phase === "running" || session.phase === "overtime";
  browserCapabilities.syncWakeLock(isActive, isPageVisible);
}

function refreshActiveSession() {
  const nowMs = performance.now();
  const previousPhase = session.phase;
  session = synchronizePhase(session, nowMs);
  if (session.phase !== previousPhase
    || lastCheckpointPerfMs === null
    || nowMs - lastCheckpointPerfMs >= 15_000) {
    if (sessionWritesBlocked || !storage) lastCheckpointPerfMs = nowMs;
    else persistSessionCheckpoint(nowMs);
  }
  render(nowMs);
}

function applyDuration(durationMs, nowMs) {
  session = changeDuration(session, durationMs, nowMs);
  render(nowMs, { syncDurationField: true });
  syncWakeLockForSession();
  durationWritesBlocked = false;
  persistDuration();
  persistSessionCheckpoint(nowMs);
}

function startFromSetup(nowMs) {
  const durationMs = getInputDurationMs();
  if (durationMs === null) return;
  session = changeDuration(session, durationMs, nowMs);
  session = startSession(session, nowMs);
  render(nowMs, { syncDurationField: true });
  syncWakeLockForSession();
  durationWritesBlocked = false;
  persistDuration();
  persistSessionCheckpoint(nowMs);
  primaryAction.focus({ preventScroll: true });
}

settingsAction.addEventListener("click", () => {
  setSettingsOpen(!settingsAreOpen);
});

settingsCloseAction.addEventListener("click", () => {
  setSettingsOpen(false, { restoreFocus: true });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsAreOpen && !event.defaultPrevented
    && !warningDialog.open && !resetDialog.open && !recoveryDialog.open) {
    event.preventDefault();
    setSettingsOpen(false, { restoreFocus: true });
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!settingsAreOpen || settingsPanel.contains(event.target) || settingsAction.contains(event.target)
    || warningDialog.open || resetDialog.open || recoveryDialog.open) return;
  setSettingsOpen(false, { restoreFocus: settingsPanel.contains(document.activeElement) });
});

primaryAction.addEventListener("click", () => {
  const nowMs = performance.now();
  if (session.phase === "setup") {
    startFromSetup(nowMs);
  } else if (session.phase === "paused") {
    session = resumeSession(session, nowMs);
    render(nowMs);
    syncWakeLockForSession();
    persistSessionCheckpoint(nowMs);
  } else {
    session = pauseSession(session, nowMs);
    render(nowMs);
    syncWakeLockForSession();
    persistSessionCheckpoint(nowMs);
  }
});

resetAction.addEventListener("click", () => {
  resetTrigger = resetAction;
  resetDialog.showModal();
});

resetDialog.addEventListener("close", () => {
  if (resetDialog.returnValue === "reset") {
    session = resetSession(session);
    durationWasTouched = false;
    settingsAreOpen = false;
    render(performance.now(), { syncDurationField: true });
    syncWakeLockForSession();
    durationWritesBlocked = false;
    persistDuration();
    removeSavedSession();
    primaryAction.focus();
  } else if (resetTrigger?.isConnected) {
    resetTrigger.focus();
  }
  resetTrigger = null;
});

resetDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && resetDialog.open) {
    event.preventDefault();
    resetDialog.close("cancel");
  }
});

durationInput.addEventListener("input", () => {
  durationWasTouched = true;
  const durationMs = getInputDurationMs();
  if (session.phase === "setup" && durationMs !== null) {
    const nowMs = performance.now();
    session = changeDuration(session, durationMs, nowMs);
    render(nowMs);
    durationWritesBlocked = false;
    persistDuration();
    return;
  }
  updatePresetSelection();
  updateDurationFieldError();
});

durationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const durationMs = getInputDurationMs();
  if (durationMs === null) {
    durationWasTouched = true;
    updateDurationFieldError();
    return;
  }
  const nowMs = performance.now();
  if (session.phase === "setup") startFromSetup(nowMs);
  else applyDuration(durationMs, nowMs);
});

for (const button of document.querySelectorAll(".preset-button")) {
  button.addEventListener("click", () => {
    const durationMs = Number(button.dataset.minutes) * MINUTE_MS;
    durationInput.value = String(durationMs / MINUTE_MS);
    durationWasTouched = false;
    applyDuration(durationMs, performance.now());
  });
}

themeSelect.addEventListener("change", () => {
  const result = validatePreferences({ ...preferences, theme: themeSelect.value });
  if (!result.valid) return;
  preferences = result.value;
  preferencesWritesBlocked = false;
  applyTheme(preferences.theme);
  persistPreferences();
});

function applyTheme(value) {
  if (value === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = value;
  themeSelect.value = value;
}

function warningInputValues(inputs) {
  return inputs.map((input) => input.valueAsNumber);
}

function validateWarningForm() {
  const result = validateWarningSchedule(
    warningInputValues(countdownInputs),
    warningInputValues(overtimeInputs),
  );
  warningError.textContent = result.valid ? "" : result.error;
  return result;
}

function populateWarningForm(warnings) {
  countdownInputs.forEach((input, index) => {
    input.value = String(warnings.countdownMinutes[index]);
  });
  overtimeInputs.forEach((input, index) => {
    input.value = String(warnings.overtimeMinutes[index]);
  });
  warningError.textContent = "";
}

warningSettingsAction.addEventListener("click", () => {
  warningSettingsTrigger = warningSettingsAction;
  populateWarningForm(preferences.warnings);
  warningDialog.showModal();
});

warningForm.addEventListener("input", validateWarningForm);
warningForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const warningResult = validateWarningForm();
  if (!warningResult.valid) return;
  const result = validatePreferences({ ...preferences, warnings: warningResult.value });
  if (!result.valid) {
    warningError.textContent = result.error;
    return;
  }
  preferences = result.value;
  preferencesWritesBlocked = false;
  render(performance.now());
  persistPreferences();
  warningDialog.close("save");
});

warningDefaultsAction.addEventListener("click", () => {
  populateWarningForm(DEFAULT_PREFERENCES.warnings);
});

warningCancelAction.addEventListener("click", () => warningDialog.close("cancel"));

warningDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && warningDialog.open) {
    event.preventDefault();
    warningDialog.close("cancel");
  }
});

warningDialog.addEventListener("close", () => {
  if (warningSettingsTrigger?.isConnected) warningSettingsTrigger.focus();
  warningSettingsTrigger = null;
});

recoveryRestoreAction.addEventListener("click", () => {
  if (!recoveryCheckpoint) return;
  session = restoreCheckpointPaused(recoveryCheckpoint);
  recoveryCheckpoint = null;
  sessionWritesBlocked = false;
  durationWritesBlocked = false;
  recoveryDialog.close();
  render(performance.now(), { syncDurationField: true });
  syncWakeLockForSession();
  persistDuration();
  persistSessionCheckpoint(performance.now());
});

recoveryDiscardAction.addEventListener("click", () => {
  if (!recoveryCheckpoint) return;
  session = createInitialSessionState(recoveryCheckpoint.durationMs);
  recoveryCheckpoint = null;
  durationWritesBlocked = false;
  recoveryDialog.close();
  render(performance.now(), { syncDurationField: true });
  syncWakeLockForSession();
  persistDuration();
  removeSavedSession();
});

recoveryReturnAction.addEventListener("click", () => {
  session = createInitialSessionState(session.durationMs);
  recoveryCheckpoint = null;
  recoveryDialog.close();
  render(performance.now(), { syncDurationField: true });
  syncWakeLockForSession();
  removeSavedSession();
});

recoveryDialog.addEventListener("cancel", (event) => event.preventDefault());
recoveryDialog.addEventListener("close", () => primaryAction.focus());
persistenceRetryAction.addEventListener("click", retryPersistence);
fullscreenAction.addEventListener("click", () => {
  restoreFullscreenFocus = true;
  browserCapabilities.toggleFullscreen();
});
document.addEventListener("focusin", trackFullscreenFocus);

window.addEventListener("pageshow", () => {
  if (session.phase === "running" || session.phase === "overtime") refreshActiveSession();
  else {
    render(performance.now());
    persistSessionCheckpoint(performance.now());
  }
  syncWakeLockForSession();
});
window.addEventListener("pagehide", (event) => {
  persistSessionCheckpoint(performance.now());
  syncWakeLockForSession(false);
  browserCapabilities.handlePageHide(event.persisted);
  if (!event.persisted) document.removeEventListener("focusin", trackFullscreenFocus);
  if (refreshIntervalId !== null) {
    window.clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    syncWakeLockForSession(false);
    persistSessionCheckpoint(performance.now());
    updateRefreshInterval();
  } else if (session.phase === "running" || session.phase === "overtime") {
    refreshActiveSession();
    syncWakeLockForSession();
  } else {
    render(performance.now());
    persistSessionCheckpoint(performance.now());
    syncWakeLockForSession();
  }
});

loadPersistedState();
applyTheme(preferences.theme);
render(performance.now(), { syncDurationField: true });
syncWakeLockForSession();
