'use strict';

// Config depends on: Logger, StorageService (loaded before this file)
(function attachConfig() {
  const { WTTRX } = globalThis;

  const DEFAULTS = Object.freeze({
    autoStart: false,
    retryMaxAttempts: 3,
    retryDelayMs: 1500,
    observerDebounceMs: 500,
    actionDelayMs: 800,
    debugMode: true,
  });

  let _current = { ...DEFAULTS };

  async function load() {
    try {
      const stored = await WTTRX.StorageService.get(WTTRX.STORAGE_KEYS.CONFIG);
      if (stored && typeof stored === 'object') {
        _current = { ...DEFAULTS, ...stored };
        WTTRX.DEBUG = _current.debugMode ?? true;
      }
      WTTRX.Logger.log('content', 'Config carregada', _current);
    } catch (e) {
      WTTRX.Logger.warn('content', 'Falha ao carregar config, usando padrões:', e.message);
    }
  }

  async function save(partial) {
    if (!partial || typeof partial !== 'object') return;
    _current = { ..._current, ...partial };
    await WTTRX.StorageService.set(WTTRX.STORAGE_KEYS.CONFIG, _current);
    WTTRX.DEBUG = _current.debugMode ?? true;
    WTTRX.Logger.log('content', 'Config salva', _current);
  }

  function get(key) {
    return key !== undefined ? _current[key] : { ..._current };
  }

  WTTRX.Config = Object.freeze({ load, save, get, DEFAULTS });
})();
