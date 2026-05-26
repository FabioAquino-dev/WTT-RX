'use strict';

const VERSION     = '0.1.0';
const LOG_CTX     = '[WTT-RX][background]';
const STORAGE_KEY = 'wttrx_config';

const ACTIONS = Object.freeze({
  PING:             'PING',
  START_AUTOMATION: 'START_AUTOMATION',
  STOP_AUTOMATION:  'STOP_AUTOMATION',
  GET_STATUS:       'GET_STATUS',
  SAVE_CONFIG:      'SAVE_CONFIG',
  GET_CONFIG:       'GET_CONFIG',
});

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`${LOG_CTX} Instalada. Motivo: ${reason} | Versão: ${VERSION}`);
});

// ─────────────────────────────────────────────
// Message routing
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.action) return false;

  console.log(`${LOG_CTX} Mensagem recebida: "${message.action}"`, { tabId: sender.tab?.id ?? 'popup' });

  const result = _handleMessage(message, sender);

  if (result instanceof Promise) {
    result
      .then(sendResponse)
      .catch((e) => {
        console.error(`${LOG_CTX} Erro ao processar "${message.action}":`, e.message);
        sendResponse({ error: e.message });
      });
    return true; // keep the channel open
  }

  sendResponse(result);
  return false;
});

// ─────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────
function _handleMessage(message, sender) {
  switch (message.action) {
    case ACTIONS.PING:
      return { pong: true, version: VERSION };

    case ACTIONS.GET_CONFIG:
      return _getConfig();

    case ACTIONS.SAVE_CONFIG:
      return _saveConfig(message.payload);

    case ACTIONS.START_AUTOMATION:
    case ACTIONS.STOP_AUTOMATION:
    case ACTIONS.GET_STATUS:
      return _forwardToContentScript(message, sender);

    default:
      console.warn(`${LOG_CTX} Ação desconhecida: "${message.action}"`);
      return { error: `Ação desconhecida: ${message.action}` };
  }
}

function _getConfig() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve({ config: result[STORAGE_KEY] ?? null });
    });
  });
}

function _saveConfig(config) {
  if (!config || typeof config !== 'object') {
    return Promise.reject(new Error('Config inválida'));
  }
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve({ saved: true });
    });
  });
}

async function _forwardToContentScript(message, sender) {
  // If the message already came from a content script (has sender.tab), don't forward again
  if (sender.tab) {
    return { error: 'Não é possível redirecionar mensagem que veio de content script' };
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];

  if (!tab?.id) {
    return { error: 'Nenhuma aba ativa encontrada' };
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
