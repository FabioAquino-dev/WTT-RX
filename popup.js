'use strict';

const $ = id => document.getElementById(id);

const el = {
  statusDot:  $('js-status-dot'),
  statusLabel:$('js-status-label'),
  btnToggle:  $('js-btn-toggle'),
  hint:       $('js-hint'),
};

let _panelActive = false;

// ── State helpers ──────────────────────────────────────────────────────────────
function setActive(active) {
  _panelActive = active;

  el.statusDot.className = 'status-card__dot' + (active ? ' is-running' : '');
  el.statusLabel.textContent = active ? 'Painel ativo na página' : 'Painel inativo';

  el.btnToggle.textContent = active ? 'Desativar Painel' : 'Ativar Painel';
  el.btnToggle.className   = 'btn btn--full ' + (active ? 'btn--danger' : 'btn--primary');
}

function setError(msg) {
  el.statusDot.className = 'status-card__dot is-error';
  el.statusLabel.textContent = 'Erro';
  el.hint.textContent = msg;
}

// ── Messaging ──────────────────────────────────────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function sendToTab(tabId, action) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(
          'Extensão não disponível nesta página. ' +
          'Recarregue a página do sistema e tente novamente.'
        ));
        return;
      }
      resolve(response);
    });
  });
}

// ── Toggle handler ─────────────────────────────────────────────────────────────
async function handleToggle() {
  el.btnToggle.disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');

    const resp = await sendToTab(tab.id, 'WTTRX_TOGGLE_PANEL');
    setActive(resp.panelOpen);
  } catch (err) {
    setError(err.message);
  } finally {
    el.btnToggle.disabled = false;
  }
}

// ── Init: check if panel is already active in the current tab ──────────────────
async function init() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) { setActive(false); return; }

    const resp = await sendToTab(tab.id, 'WTTRX_GET_STATUS');
    setActive(resp.panelOpen);
  } catch {
    // Content script not injected yet — show default inactive state
    setActive(false);
  }
}

el.btnToggle.addEventListener('click', handleToggle);
init();
