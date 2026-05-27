'use strict';

const ENDPOINT = '/pserver/DprintMI2.exe';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Session / HTTP / Parse  (reused from MVP, unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

function captureSessionId() {
  const cookieMatch = document.cookie.match(
    /(?:^|;\s*)(?:sessionid|JSESSIONID|PHPSESSID|session_id|SID|sid)=([^;]+)/i
  );
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

  for (const key of ['sessionId', 'session_id', 'SESSION_ID', 'sessionID', 'SID']) {
    if (typeof window[key] === 'string' && window[key]) return window[key];
  }

  for (const key of ['sessionid', 'sessionId', 'session_id', 'sid', 'SID']) {
    const v = sessionStorage.getItem(key);
    if (v) return v;
  }

  const hiddenInput = document.querySelector(
    'input[type="hidden"][name*="session" i], input[type="hidden"][name*="sid" i]'
  );
  return hiddenInput?.value || null;
}

async function postAction(action, sessionId) {
  const params = new URLSearchParams({ action });
  if (sessionId) params.set('sessionid', sessionId);

  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include',
    body: params.toString(),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} — action: ${action}`);
  return resp.text();
}

function extractOnclickArgs(attr) {
  if (!attr) return null;
  const m = attr.match(/\w+\s*\(([^)]*)\)/);
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, ''));
}

function parseTableRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];

  doc.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (!cells.length) return;

    const onclick = {};
    [tr, ...cells].forEach(node => {
      const oc = node.getAttribute('onclick');
      if (!oc) return;
      const fn = oc.match(/^([a-zA-Z_]\w*)\s*\(/)?.[1];
      if (fn) onclick[fn] = extractOnclickArgs(oc);
    });

    rows.push({ cells: cells.map(td => td.textContent.trim()), onclick });
  });

  return rows;
}

function parseStudiesHTML(html) {
  return parseTableRows(html).map(row => {
    const [patientId, patientName, studyId, modality, studyDescription, accessionNumber, status, ...extra] = row.cells;
    return {
      patientId:        patientId        ?? null,
      patientName:      patientName      ?? null,
      studyId:          studyId          ?? null,
      modality:         modality         ?? null,
      studyDescription: studyDescription ?? null,
      accessionNumber:  accessionNumber  ?? null,
      status:           status           ?? null,
      getStdPrints:     row.onclick.getStdPrints ?? null,
      associate:        row.onclick.associate    ?? null,
      _extra:           extra.length ? extra : undefined,
      _rawCells:        row.cells,
    };
  });
}

function parseUnrecPrintsHTML(html) {
  return parseTableRows(html).map(row => ({
    cells:        row.cells,
    getStdPrints: row.onclick.getStdPrints ?? null,
    associate:    row.onclick.associate    ?? null,
    _rawOnclick:  Object.keys(row.onclick).length ? row.onclick : undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Floating panel
// ═══════════════════════════════════════════════════════════════════════════════

let _panel = null;

// ── Panel CSS (injected into Shadow DOM) ───────────────────────────────────────
const PANEL_CSS = `<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

#wttrx-panel {
  width: 300px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  color: #c9d1d9;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,.75);
  overflow: hidden;
}

/* ── Header / drag handle ── */
#wttrx-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 36px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  cursor: grab;
  user-select: none;
}
#wttrx-header:active { cursor: grabbing; }

.panel-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  color: #1e9af5;
  pointer-events: none;
}

/* ── Status pill ── */
.status-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  pointer-events: none;
}

.sdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #484f58;
  flex-shrink: 0;
  transition: background .2s;
}
.sdot--ativo  { background: #3fb950; }
.sdot--lendo  { background: #58a6ff; animation: blink 1s ease-in-out infinite; }
.sdot--erro   { background: #da3633; }

@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

.slabel {
  font-size: 10px;
  color: #8b949e;
}

/* ── Control buttons ── */
.ctrl {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #484f58;
  cursor: pointer;
  border-radius: 4px;
  font-size: 16px;
  line-height: 1;
  transition: background .15s, color .15s;
  flex-shrink: 0;
}
.ctrl:hover            { background: #21262d; color: #c9d1d9; }
.ctrl--close:hover     { background: #6e2525; color: #f85149; }

/* ── Body ── */
#wttrx-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Action buttons ── */
.panel-actions { display: flex; flex-direction: column; gap: 5px; }

.pbtn {
  width: 100%;
  padding: 6px 10px;
  border-radius: 5px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: filter .15s, background .15s, opacity .15s;
}
.pbtn:disabled { opacity: .35; cursor: not-allowed; }

.pbtn--primary   { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.pbtn--primary:not(:disabled):hover   { filter: brightness(1.12); }

.pbtn--secondary { background: #21262d; color: #c9d1d9; border-color: #30363d; }
.pbtn--secondary:not(:disabled):hover { background: #2d333b; }

.pbtn--ghost { background: transparent; color: #8b949e; border-color: #21262d; }
.pbtn--ghost:not(:disabled):hover { color: #c9d1d9; border-color: #30363d; }

/* ── Log area ── */
.log-box {
  background: #010409;
  border: 1px solid #21262d;
  border-radius: 5px;
  padding: 6px 8px;
  max-height: 150px;
  overflow-y: auto;
  min-height: 32px;
}

.log-empty {
  font-size: 10px;
  color: #484f58;
  text-align: center;
  padding: 2px 0;
}

.log-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-entry {
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #8b949e;
  line-height: 1.45;
  word-break: break-word;
}
.log-entry--success { color: #3fb950; }
.log-entry--error   { color: #f85149; }
.log-entry--warn    { color: #d29922; }
</style>`;

// ── Panel HTML ─────────────────────────────────────────────────────────────────
const PANEL_HTML = `
<div id="wttrx-panel">
  <div id="wttrx-header">
    <span class="panel-title">WTT-RX</span>
    <div class="status-pill">
      <span class="sdot" id="wttrx-sdot"></span>
      <span class="slabel" id="wttrx-slabel">Parado</span>
    </div>
    <button class="ctrl"          id="wttrx-min"   title="Minimizar">−</button>
    <button class="ctrl ctrl--close" id="wttrx-close" title="Fechar">×</button>
  </div>
  <div id="wttrx-body">
    <div class="panel-actions">
      <button class="pbtn pbtn--primary"   id="wttrx-btn-studies">Ler exames reconhecidos</button>
      <button class="pbtn pbtn--secondary" id="wttrx-btn-unrec"  >Ler não reconhecidos</button>
      <button class="pbtn pbtn--ghost"     id="wttrx-btn-export"  disabled>Exportar diagnóstico</button>
    </div>
    <div class="log-box">
      <p class="log-empty" id="wttrx-log-empty">Nenhuma atividade ainda.</p>
      <ul class="log-list" id="wttrx-log-list" style="display:none;"></ul>
    </div>
  </div>
</div>`;

// ── Panel functions ────────────────────────────────────────────────────────────

function createPanel() {
  if (_panel) return;

  const host = document.createElement('div');
  host.id = 'wttrx-panel-host';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = PANEL_CSS + PANEL_HTML;
  document.body.appendChild(host);

  _panel = {
    host,
    shadow,
    minimized: false,
    lastData:  null,
    refs: {
      body:      shadow.querySelector('#wttrx-body'),
      sdot:      shadow.querySelector('#wttrx-sdot'),
      slabel:    shadow.querySelector('#wttrx-slabel'),
      logEmpty:  shadow.querySelector('#wttrx-log-empty'),
      logList:   shadow.querySelector('#wttrx-log-list'),
      btnMin:    shadow.querySelector('#wttrx-min'),
      btnExport: shadow.querySelector('#wttrx-btn-export'),
    },
  };

  shadow.querySelector('#wttrx-min').addEventListener('click', () =>
    _panel.minimized ? restorePanel() : minimizePanel()
  );
  shadow.querySelector('#wttrx-close').addEventListener('click', removePanel);
  shadow.querySelector('#wttrx-btn-studies').addEventListener('click', handleReadStudies);
  shadow.querySelector('#wttrx-btn-unrec').addEventListener('click', handleReadUnrec);
  shadow.querySelector('#wttrx-btn-export').addEventListener('click', handleExport);

  makeDraggable(host, shadow.querySelector('#wttrx-header'));
  updateStatus('ativo', 'Ativo');
  addLog('Painel WTT-RX iniciado');
}

function removePanel() {
  if (!_panel) return;
  _panel.host.remove();
  _panel = null;
}

function minimizePanel() {
  if (!_panel || _panel.minimized) return;
  _panel.refs.body.style.display = 'none';
  _panel.minimized = true;
  _panel.refs.btnMin.textContent = '+';
  _panel.refs.btnMin.title = 'Restaurar';
}

function restorePanel() {
  if (!_panel || !_panel.minimized) return;
  _panel.refs.body.style.display = '';
  _panel.minimized = false;
  _panel.refs.btnMin.textContent = '−';
  _panel.refs.btnMin.title = 'Minimizar';
}

function togglePanel() {
  if (_panel) { removePanel(); return { panelOpen: false }; }
  createPanel();
  return { panelOpen: true };
}

function updateStatus(state, text) {
  if (!_panel) return;
  _panel.refs.sdot.className = `sdot sdot--${state}`;
  _panel.refs.slabel.textContent = text;
}

function addLog(text, type = 'info') {
  if (!_panel) return;
  const { logEmpty, logList } = _panel.refs;

  logEmpty.style.display = 'none';
  logList.style.display  = 'flex';

  const time = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const li = document.createElement('li');
  li.className = `log-entry${type !== 'info' ? ` log-entry--${type}` : ''}`;
  li.textContent = `[${time}] ${text}`;
  logList.insertBefore(li, logList.firstChild);

  while (logList.children.length > 12) logList.removeChild(logList.lastChild);
}

function makeDraggable(host, handle) {
  let dragging = false;
  let startX, startY, startRight, startBottom;

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    dragging    = true;
    startX      = e.clientX;
    startY      = e.clientY;
    startRight  = parseInt(host.style.right,  10) || 20;
    startBottom = parseInt(host.style.bottom, 10) || 20;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    host.style.right  = Math.max(0, startRight  - (e.clientX - startX)) + 'px';
    host.style.bottom = Math.max(0, startBottom - (e.clientY - startY)) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });
}

// ── Panel action handlers ──────────────────────────────────────────────────────

function _setActionButtonsDisabled(disabled) {
  if (!_panel) return;
  _panel.shadow.querySelectorAll('.pbtn').forEach(b => { b.disabled = disabled; });
}

async function handleReadStudies() {
  if (!_panel) return;
  _setActionButtonsDisabled(true);
  updateStatus('lendo', 'Lendo…');
  addLog('Buscando exames reconhecidos…');

  try {
    const sessionId = captureSessionId();
    const html      = await postAction('findStudies', sessionId);
    const studies   = parseStudiesHTML(html);

    if (!_panel) return;
    _panel.lastData = { ..._panel.lastData, studies, _rawStudiesHtml: html };
    _panel.refs.btnExport.disabled = false;

    if (!studies.length) {
      addLog('Nenhum exame reconhecido encontrado.', 'warn');
    } else {
      addLog(`${studies.length} exame(s) reconhecido(s).`, 'success');
      studies.slice(0, 5).forEach(s => {
        const name = s.patientName || s._rawCells[0] || '—';
        addLog(`  ${name} | ${s.modality || '?'} | ${s.status || '?'}`);
      });
      if (studies.length > 5) addLog(`  … e mais ${studies.length - 5}`);
    }
    updateStatus('ativo', 'Ativo');
  } catch (err) {
    if (_panel) { addLog(`Erro: ${err.message}`, 'error'); updateStatus('erro', 'Erro'); }
  } finally {
    if (_panel) {
      _setActionButtonsDisabled(false);
      if (!_panel.lastData) _panel.refs.btnExport.disabled = true;
    }
  }
}

async function handleReadUnrec() {
  if (!_panel) return;
  _setActionButtonsDisabled(true);
  updateStatus('lendo', 'Lendo…');
  addLog('Buscando exames não reconhecidos…');

  try {
    const sessionId = captureSessionId();
    const html      = await postAction('findUnrecPrints', sessionId);
    const items     = parseUnrecPrintsHTML(html);

    if (!_panel) return;
    _panel.lastData = { ..._panel.lastData, unrecPrints: items, _rawUnrecHtml: html };
    _panel.refs.btnExport.disabled = false;

    if (!items.length) {
      addLog('Nenhum exame não reconhecido.', 'warn');
    } else {
      addLog(`${items.length} item(ns) não reconhecido(s).`, 'success');
      items.slice(0, 5).forEach((item, i) => {
        addLog(`  #${i + 1}: ${item.cells.filter(Boolean).slice(0, 3).join(' | ')}`);
      });
      if (items.length > 5) addLog(`  … e mais ${items.length - 5}`);
    }
    updateStatus('ativo', 'Ativo');
  } catch (err) {
    if (_panel) { addLog(`Erro: ${err.message}`, 'error'); updateStatus('erro', 'Erro'); }
  } finally {
    if (_panel) {
      _setActionButtonsDisabled(false);
      if (!_panel.lastData) _panel.refs.btnExport.disabled = true;
    }
  }
}

function handleExport() {
  if (!_panel?.lastData) {
    addLog('Nada para exportar. Execute uma leitura primeiro.', 'warn');
    return;
  }

  const json = JSON.stringify(
    { exportedAt: new Date().toISOString(), ..._panel.lastData },
    null, 2
  );

  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `wttrx-diagnostico-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // Fallback when blob URLs are blocked by host page CSP
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    a.download = `wttrx-diagnostico-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  addLog('Diagnóstico exportado.', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Message listener
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    case 'WTTRX_GET_STATUS':
      sendResponse({ ok: true, panelOpen: !!_panel });
      return false;

    case 'WTTRX_TOGGLE_PANEL':
      sendResponse({ ok: true, ...togglePanel() });
      return false;

    case 'WTTRX_FETCH':
      // Kept for direct popup fetch (backwards compat)
      (async () => {
        try {
          const sessionId = captureSessionId();
          const [studiesHtml, unrecHtml] = await Promise.all([
            postAction('findStudies',     sessionId),
            postAction('findUnrecPrints', sessionId),
          ]);
          sendResponse({
            ok:              true,
            sessionCaptured: !!sessionId,
            studies:         parseStudiesHTML(studiesHtml),
            unrecPrints:     parseUnrecPrintsHTML(unrecHtml),
            _rawStudiesHtml: studiesHtml,
            _rawUnrecHtml:   unrecHtml,
          });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    default:
      return false;
  }
});
