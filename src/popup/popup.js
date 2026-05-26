'use strict';

const LOG = (m, ...a) => console.log(`[WTT-RX][popup] ${m}`, ...a);
const ERR = (m, ...a) => console.error(`[WTT-RX][popup] ${m}`, ...a);

const ACTIONS = Object.freeze({
  PING:             'PING',
  START_AUTOMATION: 'START_AUTOMATION',
  STOP_AUTOMATION:  'STOP_AUTOMATION',
  GET_STATUS:       'GET_STATUS',
});

// ─────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────
const el = {
  version:    document.getElementById('js-version'),
  statusDot:  document.getElementById('js-status-dot'),
  statusLabel:document.getElementById('js-status-label'),
  btnStart:   document.getElementById('js-btn-start'),
  btnStop:    document.getElementById('js-btn-stop'),
  queueSize:  document.getElementById('js-queue-size'),
  processed:  document.getElementById('js-processed'),
  errors:     document.getElementById('js-errors'),
  logEmpty:   document.getElementById('js-log-empty'),
  logList:    document.getElementById('js-log-list'),
  btnOptions: document.getElementById('js-btn-options'),
};

let _errorCount = 0;

// ─────────────────────────────────────────────
// Messaging
// ─────────────────────────────────────────────
function sendMessage(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// ─────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────
function setStatus(state, label) {
  el.statusDot.className = 'status-card__dot';
  if (state !== 'idle') el.statusDot.classList.add(`is-${state}`);
  el.statusLabel.textContent = label;
}

function setRunning(isRunning) {
  el.btnStart.disabled = isRunning;
  el.btnStop.disabled  = !isRunning;
}

function addLogEntry(text, type = '') {
  el.logEmpty.style.display = 'none';
  el.logList.style.display  = 'flex';

  const li = document.createElement('li');
  li.className = `log__entry${type ? ` log__entry--${type}` : ''}`;
  li.textContent = text;
  el.logList.insertBefore(li, el.logList.firstChild);

  // Keep at most 8 entries
  while (el.logList.children.length > 8) {
    el.logList.removeChild(el.logList.lastChild);
  }
}

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────
async function init() {
  LOG('Popup iniciado');

  el.btnStart.addEventListener('click', async () => {
    try {
      setStatus('running', 'Iniciando...');
      setRunning(true);
      const res = await sendMessage(ACTIONS.START_AUTOMATION);
      if (res?.started) {
        setStatus('running', 'Automação em execução');
        addLogEntry('Automação iniciada', 'success');
        LOG('Automação iniciada com sucesso');
      } else {
        throw new Error(res?.error ?? 'Resposta inesperada');
      }
    } catch (e) {
      _errorCount++;
      el.errors.textContent = _errorCount;
      setStatus('error', 'Erro ao iniciar');
      setRunning(false);
      addLogEntry(`Erro: ${e.message}`, 'error');
      ERR('Falha ao iniciar automação:', e.message);
    }
  });

  el.btnStop.addEventListener('click', async () => {
    try {
      await sendMessage(ACTIONS.STOP_AUTOMATION);
      setStatus('paused', 'Parado pelo usuário');
      setRunning(false);
      addLogEntry('Automação parada');
      LOG('Automação parada');
    } catch (e) {
      ERR('Falha ao parar automação:', e.message);
    }
  });

  el.btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Fetch initial status from the active tab's content script
  try {
    const res = await sendMessage(ACTIONS.GET_STATUS);
    if (res?.state) {
      const state = res.state.toLowerCase();
      setStatus(state === 'running' ? 'running' : 'idle', `WTT-RX: ${state}`);
      if (res.queueSize !== undefined) el.queueSize.textContent = res.queueSize;
      if (res.version) el.version.textContent = `v${res.version}`;
    } else {
      setStatus('idle', 'Pronto');
    }
  } catch (e) {
    setStatus('idle', 'Pronto');
    LOG('Status inicial indisponível (sem aba ativa ou extensão não injetada):', e.message);
  }
}

init().catch((e) => ERR('Erro fatal no popup:', e.message));
