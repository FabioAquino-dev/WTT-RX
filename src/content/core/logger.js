'use strict';

(function attachLogger() {
  const { WTTRX } = globalThis;

  // Persists the last error to storage for later diagnosis.
  // Fails silently if storage is unavailable.
  function _persistError(context, message) {
    try {
      chrome.storage.local.set({
        [WTTRX.STORAGE_KEYS.LAST_ERROR]: {
          context,
          message,
          timestamp: Date.now(),
        },
      });
    } catch (_) { /* storage unavailable — acceptable */ }
  }

  function _fmt(context, msg) {
    return `[WTT-RX][${context}] ${msg}`;
  }

  WTTRX.Logger = Object.freeze({
    log(context, message, ...args) {
      if (!WTTRX.DEBUG) return;
      console.log(_fmt(context, message), ...args);
    },

    warn(context, message, ...args) {
      console.warn(_fmt(context, message), ...args);
    },

    error(context, message, ...args) {
      console.error(_fmt(context, message), ...args);
      _persistError(context, String(message));
    },
  });
})();
