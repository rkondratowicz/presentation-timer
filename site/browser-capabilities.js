function errorName(error) {
  return error instanceof Error && error.name ? error.name : "browser error";
}

function getWakeLockManager(navigatorObject) {
  try {
    const wakeLockManager = navigatorObject?.wakeLock;
    return typeof wakeLockManager?.request === "function" ? wakeLockManager : null;
  } catch {
    return null;
  }
}

function supportsFullscreen(documentObject) {
  try {
    return typeof documentObject?.documentElement?.requestFullscreen === "function"
      && typeof documentObject.exitFullscreen === "function"
      && documentObject.fullscreenEnabled !== false;
  } catch {
    return false;
  }
}

export function createBrowserCapabilities({
  documentObject = document,
  navigatorObject = navigator,
  onChange = () => {},
} = {}) {
  const wakeLockManager = getWakeLockManager(navigatorObject);
  const fullscreenSupported = supportsFullscreen(documentObject);
  let pageVisible = !documentObject.hidden;
  let wakeWanted = false;
  let wakeGeneration = 0;
  let wakeStatus = "idle";
  let wakeErrorName = "";
  let pendingWakeRequest = null;
  let wakeSentinelRecord = null;
  let fullscreenNotice = "";
  let fullscreenPending = false;
  let fullscreenGeneration = 0;
  let previousSnapshot = null;

  function getWakeLockMessage() {
    if (!pageVisible) return "";
    if (wakeStatus === "release-failed") {
      return `Screen Wake Lock could not be released (${wakeErrorName}). The timer state is unchanged; the device may stay awake.`;
    }
    if (!wakeWanted) return "";
    if (wakeStatus === "unsupported") {
      return "Device may sleep: Screen Wake Lock is not supported in this browser.";
    }
    if (wakeStatus === "pending" || wakeStatus === "releasing") {
      return wakeStatus === "releasing"
        ? "Updating the screen wake lock…"
        : "Requesting a screen wake lock…";
    }
    if (wakeStatus === "held") return "Screen wake lock is active.";
    if (wakeStatus === "failed") {
      return `Device may sleep: Screen Wake Lock was denied or failed (${wakeErrorName}). The timer continues; pause and resume to retry.`;
    }
    if (wakeStatus === "released") {
      return "Device may sleep: the browser released the wake lock. Pause and resume to retry.";
    }
    return "";
  }

  function snapshot() {
    return {
      wakeLockMessage: getWakeLockMessage(),
      fullscreenSupported,
      fullscreenActive: Boolean(documentObject.fullscreenElement),
      fullscreenPending,
      fullscreenNotice,
    };
  }

  function notify() {
    const next = snapshot();
    if (previousSnapshot
      && Object.keys(next).every((key) => next[key] === previousSnapshot[key])) {
      return;
    }
    previousSnapshot = next;
    onChange(next);
  }

  function removeWakeReleaseListener(record) {
    if (record.onRelease) {
      record.sentinel.removeEventListener("release", record.onRelease);
      record.onRelease = null;
    }
  }

  function addWakeReleaseListener(record) {
    if (record.onRelease) return;
    record.onRelease = () => {
      if (wakeSentinelRecord !== record) return;
      wakeSentinelRecord = null;
      record.onRelease = null;
      wakeStatus = wakeWanted ? "released" : "idle";
      wakeErrorName = "";
      notify();
    };
    record.sentinel.addEventListener("release", record.onRelease);
  }

  function handleReleaseFailure(record, error) {
    record.releasing = false;
    if (record.sentinel.released) {
      removeWakeReleaseListener(record);
      if (wakeSentinelRecord === record) wakeSentinelRecord = null;
      wakeStatus = wakeWanted ? "released" : "idle";
      wakeErrorName = "";
      notify();
      if (wakeWanted) ensureWakeLock();
      return;
    }

    wakeSentinelRecord = record;
    try {
      addWakeReleaseListener(record);
    } catch (listenerError) {
      wakeErrorName = errorName(listenerError);
    }
    wakeStatus = "release-failed";
    wakeErrorName ||= errorName(error);
    notify();
  }

  function finishRelease(record) {
    removeWakeReleaseListener(record);
    if (wakeSentinelRecord === record) wakeSentinelRecord = null;
    record.releasing = false;
    wakeStatus = "idle";
    wakeErrorName = "";
    notify();
    if (wakeWanted) ensureWakeLock();
  }

  function releaseWakeSentinel(record) {
    if (record.releasing) return;
    record.releasing = true;
    removeWakeReleaseListener(record);
    if (wakeSentinelRecord === record) wakeStatus = "releasing";
    notify();

    let releaseResult;
    try {
      releaseResult = record.sentinel.release();
    } catch (error) {
      handleReleaseFailure(record, error);
      return;
    }
    Promise.resolve(releaseResult).then(
      () => finishRelease(record),
      (error) => handleReleaseFailure(record, error),
    );
  }

  function releaseUnclaimedSentinel(sentinel) {
    let releaseResult;
    try {
      if (typeof sentinel?.release !== "function") {
        throw new TypeError("The browser returned an invalid wake lock.");
      }
      releaseResult = sentinel.release();
    } catch (error) {
      if (wakeWanted) {
        wakeStatus = "release-failed";
        wakeErrorName = errorName(error);
        notify();
      }
      return;
    }
    Promise.resolve(releaseResult).then(
      () => {
        if (wakeWanted) ensureWakeLock();
      },
      (error) => {
        if (wakeWanted) {
          wakeStatus = "release-failed";
          wakeErrorName = errorName(error);
          notify();
        }
      },
    );
  }

  function trackWakeSentinel(sentinel) {
    if (!sentinel
      || typeof sentinel.release !== "function"
      || typeof sentinel.addEventListener !== "function"
      || typeof sentinel.removeEventListener !== "function") {
      wakeStatus = "failed";
      wakeErrorName = "invalid wake lock response";
      notify();
      if (typeof sentinel?.release === "function") releaseUnclaimedSentinel(sentinel);
      return null;
    }

    const record = { sentinel, onRelease: null, releasing: false };
    try {
      addWakeReleaseListener(record);
    } catch (error) {
      wakeStatus = "failed";
      wakeErrorName = errorName(error);
      notify();
      releaseUnclaimedSentinel(sentinel);
      return null;
    }
    wakeSentinelRecord = record;
    if (sentinel.released) {
      removeWakeReleaseListener(record);
      wakeSentinelRecord = null;
      wakeStatus = "released";
      wakeErrorName = "";
      notify();
      return null;
    }
    return record;
  }

  function acceptWakeSentinel(sentinel) {
    const record = trackWakeSentinel(sentinel);
    if (!record) return;
    wakeStatus = "held";
    wakeErrorName = "";
    notify();
  }

  function handleWakeRequestFailure(request, error) {
    if (pendingWakeRequest !== request) return;
    pendingWakeRequest = null;
    if (!wakeWanted) {
      wakeStatus = "idle";
      wakeErrorName = "";
      notify();
      return;
    }
    if (request.generation !== wakeGeneration) {
      wakeStatus = "idle";
      wakeErrorName = "";
      notify();
      ensureWakeLock();
      return;
    }
    wakeStatus = "failed";
    wakeErrorName = errorName(error);
    notify();
  }

  function handleWakeRequestSuccess(request, sentinel) {
    if (pendingWakeRequest !== request) {
      releaseUnclaimedSentinel(sentinel);
      return;
    }
    pendingWakeRequest = null;
    if (!wakeWanted) {
      wakeStatus = "idle";
      wakeErrorName = "";
      notify();
      const record = trackWakeSentinel(sentinel);
      if (record) releaseWakeSentinel(record);
      return;
    }
    acceptWakeSentinel(sentinel);
  }

  function ensureWakeLock() {
    if (!wakeWanted) return;
    if (!wakeLockManager) {
      wakeStatus = "unsupported";
      notify();
      return;
    }
    if (wakeSentinelRecord) {
      if (wakeSentinelRecord.releasing) {
        wakeStatus = "releasing";
      } else if (wakeStatus !== "release-failed") {
        wakeStatus = "held";
      }
      notify();
      return;
    }
    if (pendingWakeRequest) {
      wakeStatus = "pending";
      notify();
      return;
    }
    if (["failed", "released", "release-failed"].includes(wakeStatus)) return;

    const request = { generation: wakeGeneration };
    pendingWakeRequest = request;
    wakeStatus = "pending";
    wakeErrorName = "";
    notify();
    let requestResult;
    try {
      requestResult = wakeLockManager.request("screen");
    } catch (error) {
      handleWakeRequestFailure(request, error);
      return;
    }
    Promise.resolve(requestResult).then(
      (sentinel) => handleWakeRequestSuccess(request, sentinel),
      (error) => handleWakeRequestFailure(request, error),
    );
  }

  function syncWakeLock(isSessionActive, isPageVisible) {
    pageVisible = Boolean(isPageVisible);
    const nextWanted = Boolean(isSessionActive) && pageVisible;
    if (nextWanted !== wakeWanted) {
      wakeWanted = nextWanted;
      wakeGeneration += 1;
      if (wakeWanted) {
        wakeStatus = wakeSentinelRecord?.releasing ? "releasing" : "idle";
        wakeErrorName = "";
      } else if (!wakeSentinelRecord) {
        wakeStatus = pendingWakeRequest ? "pending" : "idle";
        wakeErrorName = "";
      }
    }
    if (wakeWanted) ensureWakeLock();
    else if (wakeSentinelRecord) releaseWakeSentinel(wakeSentinelRecord);
    notify();
  }

  function handleFullscreenChange() {
    fullscreenPending = false;
    fullscreenGeneration += 1;
    fullscreenNotice = "";
    notify();
  }

  function handleFullscreenError() {
    if (!fullscreenPending) return;
    fullscreenPending = false;
    fullscreenGeneration += 1;
    fullscreenNotice = "The browser blocked the full-screen change. Try again from this button and check the browser's site permissions.";
    notify();
  }

  function toggleFullscreen() {
    if (!fullscreenSupported || fullscreenPending) return;
    const wasFullscreen = Boolean(documentObject.fullscreenElement);
    const operation = ++fullscreenGeneration;
    fullscreenPending = true;
    fullscreenNotice = "";
    notify();

    let result;
    try {
      result = wasFullscreen
        ? documentObject.exitFullscreen()
        : documentObject.documentElement.requestFullscreen();
    } catch (error) {
      finishFullscreenFailure(operation, error, wasFullscreen);
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (fullscreenGeneration !== operation) return;
        fullscreenPending = false;
        notify();
      },
      (error) => finishFullscreenFailure(operation, error, wasFullscreen),
    );
  }

  function finishFullscreenFailure(operation, error, wasFullscreen) {
    if (fullscreenGeneration !== operation) return;
    fullscreenPending = false;
    const action = wasFullscreen ? "exit full screen" : "enter full screen";
    fullscreenNotice = `Could not ${action} (${errorName(error)}). Check browser permissions or use the browser's own full-screen controls.`;
    notify();
  }

  function handlePageHide(isPersisted) {
    if (isPersisted) return;
    documentObject.removeEventListener("fullscreenchange", handleFullscreenChange);
    documentObject.removeEventListener("fullscreenerror", handleFullscreenError);
  }

  documentObject.addEventListener("fullscreenchange", handleFullscreenChange);
  documentObject.addEventListener("fullscreenerror", handleFullscreenError);
  notify();

  return {
    syncWakeLock,
    toggleFullscreen,
    handlePageHide,
    getSnapshot: snapshot,
  };
}
