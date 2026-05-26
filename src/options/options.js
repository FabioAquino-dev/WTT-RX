'use strict';

const LOG = (m, ...a) => console.log(`[WTT-RX][options] ${m}`, ...a);
const ERR = (m, ...a) => console.error(`[WTT-RX][options] ${m}`, ...a);

const STORAGE_KEY = 'wttrx_config';

const DEFAULTS = Object.freeze({
  retryMaxAttempts:   3,
  retryDelayMs:       1500,
  actionDelayMs:      800,
  observerDebounceMs: 500,
  autoStart:          false,
  debugMode:          true,
});

// ─────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────
const el = {
  form:               document.getElementById('js-form'),
  btnSave:            document.getElementById('js-btn-save'),
  btnReset:           document.getElementById('js-btn-reset'),
  feedback:           document.getElementById('js-feedback'),
  retryMaxAttempts:   document.getElementById('retryMaxAttempts'),
  retryDelayMs:       document.getElementById('retryDelayMs'),
  actionDelayMs:      document.getElementById('actionDelayMs'),
  observerDebounceMs: document.getElementById('observerDebounceMs'),
  autoStart:          document.getElementById('autoStart'),
  debugMode:          document.getElementById('debugMode'),
};

let _feedbackTimer = null;

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────
function showFeedback(message, isError = false) {
  clearTimeout(_feedbackTimer);
  el.feedback.textContent = message;
  el.feedback.className   = `feedback ${isError ? 'is-error' : 'is-success'}`;
  _feedbackTimer = setTimeout(() => {
    el.feedback.className = 'feedback is-hidden';
  }, 3000);
}

function populateForm(config) {
  el.retryMaxAttempts.value   = config.retryMaxAttempts   ?? DEFAULTS.retryMaxAttempts;
  el.retryDelayMs.value       = config.retryDelayMs       ?? DEFAULTS.retryDelayMs;
  el.actionDelayMs.value      = config.actionDelayMs      ?? DEFAULTS.actionDelayMs;
  el.observerDebounceMs.value = config.observerDebounceMs ?? DEFAULTS.observerDebounceMs;
  el.autoStart.checked        = config.autoStart          ?? DEFAULTS.autoStart;
  el.debugMode.checked        = config.debugMode          ?? DEFAULTS.debugMode;
}

function readForm() {
  return {
    retryMaxAttempts:   parseInt(el.retryMaxAttempts.value,   10),
    retryDelayMs:       parseInt(el.retryDelayMs.value,       10),
    actionDelayMs:      parseInt(el.actionDelayMs.value,      10),
    observerDebounceMs: parseInt(el.observerDebounceMs.value, 10),
    autoStart:          el.autoStart.checked,
    debugMode:          el.debugMode.checked,
  };
}

// ─────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────
function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        ERR('Falha ao carregar config:', chrome.runtime.lastError.message);
        resolve({ ...DEFAULTS });
        return;
      }
      resolve(result[STORAGE_KEY] ?? { ...DEFAULTS });
    });
  });
}

function saveConfig(config) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
async function init() {
  LOG('Options page iniciada');

  const config = await loadConfig();
  populateForm(config);
  LOG('Config carregada', config);

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const newConfig = readForm();
      await saveConfig(newConfig);
      showFeedback('Configurações salvas.');
      LOG('Config salva', newConfig);
    } catch (e) {
      ERR('Falha ao salvar config:', e.message);
      showFeedback('Erro ao salvar configurações.', true);
    }
  });

  el.btnReset.addEventListener('click', async () => {
    populateForm({ ...DEFAULTS });
    try {
      await saveConfig({ ...DEFAULTS });
      showFeedback('Padrões restaurados.');
      LOG('Config restaurada para padrões');
    } catch (e) {
      ERR('Falha ao restaurar padrões:', e.message);
      showFeedback('Erro ao restaurar padrões.', true);
    }
  });
}

init().catch((e) => ERR('Erro fatal na página de opções:', e.message));
