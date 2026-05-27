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

// Captura todos os parâmetros que o browser envia junto com findStudies/findUnrecPrints
function capturePageContext() {
  const ctx = {
    sessionid:  null,
    group:      null,
    stdfilter:  null,
    sourceaet:  null,
    aesource:   null,
    _sources:   {},
  };

  ctx.sessionid = captureSessionId();

  // Grupo configurado manualmente pelo usuário no painel (fonte mais confiável)
  const storedGroup = localStorage.getItem('wttrx_group');
  if (storedGroup) {
    ctx.group = storedGroup;
    ctx._sources.group = 'localStorage(wttrx_group)';
  }

  const GLOBALS = {
    group:     ['group', 'currentGroup', 'wgroup', 'workgroup', 'GRUPO', 'grp'],
    stdfilter: ['stdfilter', 'studyFilter', 'currentFilter', 'STDFILTER', 'dateFilter'],
    sourceaet: ['sourceaet', 'sourceAet', 'sourceAET', 'SOURCEAET', 'srcAET'],
    aesource:  ['aesource', 'aeSource', 'AESOURCE', 'AESource', 'aeSourceAET'],
  };

  // 1) window globals
  for (const [field, keys] of Object.entries(GLOBALS)) {
    for (const key of keys) {
      const v = window[key];
      if (typeof v === 'string' && v) {
        ctx[field] = v;
        ctx._sources[field] = `window.${key}`;
        break;
      }
    }
  }

  // 2) form inputs / selects
  const INPUT_NAMES = {
    group:     ['group', 'currentGroup', 'grpName', 'grupName'],
    stdfilter: ['stdfilter', 'filter', 'studyFilter', 'stdFilter'],
    sourceaet: ['sourceaet', 'sourceAet', 'srcAet'],
    aesource:  ['aesource', 'aeSource', 'aeSourceAet'],
  };
  for (const [field, names] of Object.entries(INPUT_NAMES)) {
    if (ctx[field]) continue;
    for (const name of names) {
      const el = document.querySelector(
        `select[name="${name}"], input[name="${name}"], input[type="hidden"][name="${name}"]`
      );
      if (el?.value) {
        ctx[field] = el.value;
        ctx._sources[field] = `input[name="${name}"]`;
        break;
      }
    }
  }

  // 3) URL query string
  const urlParams = new URLSearchParams(window.location.search);
  for (const [field, names] of Object.entries(INPUT_NAMES)) {
    if (ctx[field]) continue;
    for (const name of names) {
      const v = urlParams.get(name);
      if (v) {
        ctx[field] = v;
        ctx._sources[field] = `URL?${name}`;
        break;
      }
    }
  }

  // 4) sessionStorage
  for (const [field, keys] of Object.entries(GLOBALS)) {
    if (ctx[field]) continue;
    for (const key of keys) {
      const v = sessionStorage.getItem(key);
      if (v) {
        ctx[field] = v;
        ctx._sources[field] = `sessionStorage.${key}`;
        break;
      }
    }
  }

  return ctx;
}

// Retorna { html, payload, responseStatus, responseLength, responsePreview }
async function postAction(action, ctx) {
  // Ordem e campos idênticos ao cURL funcional confirmado:
  // cmd=DprintMI&sessionid=...&action=...&sourceaet=&group=RAIOX&aesource=&stdfilter=RELEASETODAY
  const params = new URLSearchParams();
  params.set('cmd',       'DprintMI');
  params.set('sessionid', ctx.sessionid || '');
  params.set('action',    action);
  params.set('sourceaet', ctx.sourceaet || '');
  params.set('group',     ctx.group     || '');
  params.set('aesource',  ctx.aesource  || '');
  params.set('stdfilter', ctx.stdfilter || 'RELEASETODAY');

  const payload = params.toString();

  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    credentials: 'include',
    body: payload,
  });

  const html = await resp.text();

  if (!resp.ok) throw new Error(`HTTP ${resp.status} — action: ${action}`);

  return {
    html,
    payload,
    responseStatus:  resp.status,
    responseLength:  html.length,
    responsePreview: html.slice(0, 600),
  };
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

function _parseTitleFallback(title) {
  // "415672 - ANA PAULA ... - CR - RX - TORAX - PA - 4416660"
  // parts[0]=patientId, parts[1]=patientName, parts[2]=modality,
  // parts[3...-1]=description, parts[-1]=accessionNumber
  if (!title) return {};
  const parts = title.split(' - ');
  if (parts.length < 4) return {};
  return {
    patientId:       parts[0].trim(),
    patientName:     parts[1].trim(),
    modality:        parts[2].trim(),
    description:     parts.slice(3, parts.length - 1).join(' - ').trim(),
    accessionNumber: parts[parts.length - 1].trim(),
  };
}

function parseStudiesHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = doc.querySelectorAll('.study-item');
  if (!items.length) return [];

  const t = (el, sel) => el.querySelector(sel)?.textContent.trim() || null;

  return Array.from(items).map(item => {
    const title      = item.getAttribute('title');
    const fallback   = _parseTitleFallback(title);

    // Status vem do elemento filho .study-item-status
    const statusEl    = item.querySelector('.study-item-status');
    const statusClass = statusEl
      ? Array.from(statusEl.classList).filter(c => c !== 'study-item-status').join(' ') || null
      : null;

    const patientId       = t(item, '.study-item-patid')   ?? fallback.patientId       ?? null;
    const patientName     = t(item, '.study-item-patname') ?? fallback.patientName     ?? null;
    const datetime        = t(item, '.study-item-datetime')                              ?? null;
    const modality        = t(item, '.study-item-modality') ?? fallback.modality        ?? null;
    const description     = t(item, '.study-item-stddesc')  ?? fallback.description     ?? null;
    const accessionNumber = t(item, '.study-item-accnum')   ?? fallback.accessionNumber ?? null;

    return {
      patientId,
      patientName,
      datetime,
      modality,
      description,
      accessionNumber,
      statusClass,
      onclick:          item.getAttribute('onclick'),
      associateOnclick: statusEl?.getAttribute('onclick') || null,
      title,
      _rawHtml: item.outerHTML,
    };
  });
}

function parseUnrecPrintsHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = doc.querySelectorAll('.unrec-item');
  if (!items.length) return [];

  const t = (el, sel) => el.querySelector(sel)?.textContent.trim() || null;

  return Array.from(items).map(item => {
    const id        = item.id || null;
    const statusEl  = item.querySelector('.unrec-item-status');
    const statusClass = statusEl
      ? Array.from(statusEl.classList).filter(c => c !== 'unrec-item-status').join(' ') || null
      : null;

    return {
      id,
      studyUid:   id ? id.replace(/^STUDY_/, '') : null,
      aetitle:    t(item, '.unrec-item-aetitle'),
      datetime:   t(item, '.unrec-item-datetime'),
      statusClass,
      onclick:    item.getAttribute('onclick') || item.getAttribute('onClick') || null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Floating panel
// ═══════════════════════════════════════════════════════════════════════════════

let _panel         = null;
let _selectedUnrec = null;
let _selectedStudy = null;

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

/* ── Studies list ── */
.section-label {
  font-size: 10px;
  font-weight: 600;
  color: #484f58;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 4px;
}

.studies-scroll {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}

/* scrollbar premium */
.studies-scroll::-webkit-scrollbar       { width: 4px; }
.studies-scroll::-webkit-scrollbar-track { background: transparent; }
.studies-scroll::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
.studies-scroll::-webkit-scrollbar-thumb:hover { background: #484f58; }

.study-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 4px;
  padding: 4px 7px;
  cursor: pointer;
  transition: border-color .12s, background .12s;
  user-select: none;
}
.study-card:hover {
  border-color: #388bfd;
  background: #1c2333;
}
.study-card--active {
  border-color: #1f6feb;
  background: #0d2044;
  box-shadow: 0 0 0 1px #1f6feb22;
}

.study-card__name {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.study-card__meta {
  font-size: 10px;
  color: #8b949e;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.study-card__status {
  display: inline-block;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 10px;
  margin-top: 3px;
  font-weight: 500;
}
.study-card__status.status-empty   { background: #21262d; color: #8b949e; }
.study-card__status.status-toaprov { background: #1a3a2a; color: #3fb950; }

/* ── Unrec cards ── */
.section-label--unrec { color: #d29922; }

.unrec-card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 4px;
  padding: 5px 7px;
  cursor: pointer;
  transition: border-color .12s, background .12s;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.unrec-card:hover {
  border-color: #d29922;
  background: #1c1a0e;
}
.unrec-card--active {
  border-color: #d29922;
  background: #1c1a0e;
  box-shadow: 0 0 0 1px #d2992222;
}

.unrec-card__aetitle {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.unrec-card__datetime {
  font-size: 10px;
  color: #8b949e;
  flex-shrink: 0;
}

.unrec-card__status {
  display: inline-block;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
}
.unrec-card__status.status-unrec  { background: #2d1f0e; color: #d29922; }
.unrec-card__status.status-torec  { background: #0d2a1a; color: #3fb950; }

/* ── Group config row ── */
.group-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.group-label {
  font-size: 10px;
  color: #8b949e;
  flex-shrink: 0;
}

.group-input {
  flex: 1;
  background: #010409;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  padding: 3px 6px;
  outline: none;
  text-transform: uppercase;
}
.group-input:focus { border-color: #1f6feb; }
.group-input.saved  { border-color: #238636; }

/* ── Selection state (association mode) ── */
.study-card--selected  { border-color: #1f6feb; background: #0d1e36; }
.unrec-card--selected  { border-color: #d29922; background: #1e1700; }

/* ── Association confirmation panel ── */
#wttrx-assoc-panel {
  border: 1px solid #1f6feb;
  border-radius: 6px;
  background: #0d1117;
  padding: 8px;
  display: none;
  flex-direction: column;
  gap: 5px;
}
#wttrx-assoc-panel.visible { display: flex; }
.assoc-section__label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8b949e;
  margin-bottom: 1px;
}
.assoc-section__value {
  font-size: 11px;
  font-weight: 600;
  color: #c9d1d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.assoc-section__meta {
  font-size: 10px;
  color: #8b949e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.assoc-divider {
  text-align: center;
  font-size: 10px;
  color: #8b949e;
  padding: 1px 0;
}
.assoc-btn {
  width: 100%;
  padding: 5px;
  background: #1f6feb;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
}
.assoc-btn:hover:not(:disabled) { background: #388bfd; }
.assoc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
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
    <div class="group-row">
      <span class="group-label">Grupo:</span>
      <input class="group-input" id="wttrx-group-input" type="text" placeholder="ex: RAIOX" maxlength="32" autocomplete="off" spellcheck="false" />
    </div>
    <div class="panel-actions">
      <button class="pbtn pbtn--primary"   id="wttrx-btn-studies">Ler exames reconhecidos</button>
      <button class="pbtn pbtn--secondary" id="wttrx-btn-unrec"  >Ler não reconhecidos</button>
      <button class="pbtn pbtn--ghost"     id="wttrx-btn-export"  disabled>Exportar diagnóstico</button>
    </div>
    <div id="wttrx-studies-wrap" style="display:none;">
      <div class="section-label">Exames (<span id="wttrx-studies-count">0</span>)</div>
      <div class="studies-scroll" id="wttrx-studies-list"></div>
    </div>
    <div id="wttrx-unrec-wrap" style="display:none;">
      <div class="section-label section-label--unrec">Não reconhecidos (<span id="wttrx-unrec-count">0</span>)</div>
      <div class="studies-scroll" id="wttrx-unrec-list"></div>
    </div>
    <div id="wttrx-assoc-panel">
      <div>
        <div class="assoc-section__label">Não reconhecido</div>
        <div class="assoc-section__value" id="wttrx-assoc-unrec-title">— selecione um não reconhecido</div>
        <div class="assoc-section__meta"  id="wttrx-assoc-unrec-meta"></div>
      </div>
      <div class="assoc-divider">↓ associar a ↓</div>
      <div>
        <div class="assoc-section__label">Exame reconhecido</div>
        <div class="assoc-section__value" id="wttrx-assoc-study-title">— selecione um exame reconhecido</div>
        <div class="assoc-section__meta"  id="wttrx-assoc-study-meta"></div>
      </div>
      <button class="assoc-btn" id="wttrx-btn-associate" disabled>Associar selecionados</button>
    </div>
    <div class="log-box">
      <p class="log-empty" id="wttrx-log-empty">Nenhuma atividade ainda.</p>
      <ul class="log-list" id="wttrx-log-list" style="display:none;"></ul>
    </div>
  </div>
</div>`;

// Executa código no contexto da página (onde getStdPrints está definido).
// Content scripts rodam em mundo isolado — window.getStdPrints não é acessível diretamente.
function executeInPageContext(code) {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

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
      body:          shadow.querySelector('#wttrx-body'),
      sdot:          shadow.querySelector('#wttrx-sdot'),
      slabel:        shadow.querySelector('#wttrx-slabel'),
      logEmpty:      shadow.querySelector('#wttrx-log-empty'),
      logList:       shadow.querySelector('#wttrx-log-list'),
      btnMin:        shadow.querySelector('#wttrx-min'),
      btnExport:     shadow.querySelector('#wttrx-btn-export'),
      studiesWrap:   shadow.querySelector('#wttrx-studies-wrap'),
      studiesList:   shadow.querySelector('#wttrx-studies-list'),
      studiesCount:  shadow.querySelector('#wttrx-studies-count'),
      unrecWrap:     shadow.querySelector('#wttrx-unrec-wrap'),
      unrecList:     shadow.querySelector('#wttrx-unrec-list'),
      unrecCount:      shadow.querySelector('#wttrx-unrec-count'),
      assocPanel:      shadow.querySelector('#wttrx-assoc-panel'),
      assocBtnDo:      shadow.querySelector('#wttrx-btn-associate'),
      assocUnrecTitle: shadow.querySelector('#wttrx-assoc-unrec-title'),
      assocUnrecMeta:  shadow.querySelector('#wttrx-assoc-unrec-meta'),
      assocStudyTitle: shadow.querySelector('#wttrx-assoc-study-title'),
      assocStudyMeta:  shadow.querySelector('#wttrx-assoc-study-meta'),
      groupInput:      shadow.querySelector('#wttrx-group-input'),
    },
  };

  // Restaura grupo salvo
  const savedGroup = localStorage.getItem('wttrx_group') || '';
  _panel.refs.groupInput.value = savedGroup;
  if (savedGroup) _panel.refs.groupInput.classList.add('saved');

  // Persiste ao digitar
  _panel.refs.groupInput.addEventListener('input', () => {
    const v = _panel.refs.groupInput.value.trim().toUpperCase();
    _panel.refs.groupInput.value = v;
    localStorage.setItem('wttrx_group', v);
    _panel.refs.groupInput.classList.toggle('saved', !!v);
  });

  shadow.querySelector('#wttrx-min').addEventListener('click', () =>
    _panel.minimized ? restorePanel() : minimizePanel()
  );
  shadow.querySelector('#wttrx-close').addEventListener('click', removePanel);
  shadow.querySelector('#wttrx-btn-studies').addEventListener('click', handleReadStudies);
  shadow.querySelector('#wttrx-btn-unrec').addEventListener('click', handleReadUnrec);
  shadow.querySelector('#wttrx-btn-export').addEventListener('click', handleExport);
  shadow.querySelector('#wttrx-btn-associate').addEventListener('click', handleAssociate);

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

function renderStudies(studies) {
  if (!_panel) return;
  const { studiesWrap, studiesList, studiesCount } = _panel.refs;

  studiesList.innerHTML = '';

  if (!studies.length) {
    studiesWrap.style.display = 'none';
    return;
  }

  studiesCount.textContent = studies.length;
  studiesWrap.style.display = '';

  studies.forEach(s => {
    const card = document.createElement('div');
    card.className = 'study-card';

    const name = document.createElement('div');
    name.className = 'study-card__name';
    name.textContent = s.patientName || s.title || '—';

    const meta = document.createElement('div');
    meta.className = 'study-card__meta';
    const parts = [s.modality, s.description, s.accessionNumber].filter(Boolean);
    meta.textContent = parts.join(' · ');

    card.appendChild(name);
    card.appendChild(meta);

    if (s.statusClass) {
      const badge = document.createElement('span');
      badge.className = `study-card__status ${s.statusClass}`;
      badge.textContent = s.statusClass === 'status-toaprov' ? 'Recebido' : 'Novo';
      card.appendChild(badge);
    }

    if (s.onclick) {
      card.addEventListener('click', () => {
        studiesList.querySelectorAll('.study-card--active, .study-card--selected')
          .forEach(c => c.classList.remove('study-card--active', 'study-card--selected'));
        card.classList.add('study-card--active', 'study-card--selected');

        _selectedStudy = s;
        updateAssocPanel();

        executeInPageContext(s.onclick);
        addLog(`Abrindo exame ${s.accessionNumber} — ${s.patientName || '?'}`);
      });
    }

    studiesList.appendChild(card);
  });
}

function renderUnrec(items) {
  if (!_panel) return;
  const { unrecWrap, unrecList, unrecCount } = _panel.refs;

  unrecList.innerHTML = '';

  if (!items.length) {
    unrecWrap.style.display = 'none';
    return;
  }

  unrecCount.textContent = items.length;
  unrecWrap.style.display = '';

  items.forEach(u => {
    const card = document.createElement('div');
    card.className = 'unrec-card';

    const aetitle = document.createElement('div');
    aetitle.className = 'unrec-card__aetitle';
    aetitle.textContent = u.aetitle || u.studyUid || '—';

    const dt = document.createElement('div');
    dt.className = 'unrec-card__datetime';
    dt.textContent = u.datetime || '';

    card.appendChild(aetitle);
    card.appendChild(dt);

    if (u.statusClass) {
      const badge = document.createElement('span');
      badge.className = `unrec-card__status ${u.statusClass}`;
      badge.textContent = 'N/R';
      card.appendChild(badge);
    }

    if (u.onclick) {
      card.addEventListener('click', () => {
        unrecList.querySelectorAll('.unrec-card--active, .unrec-card--selected')
          .forEach(c => c.classList.remove('unrec-card--active', 'unrec-card--selected'));
        card.classList.add('unrec-card--active', 'unrec-card--selected');

        _selectedUnrec = u;
        updateAssocPanel();

        executeInPageContext(u.onclick);
        addLog(`Abrindo não reconhecido: ${u.aetitle || '?'} - ${u.datetime || '?'}`);
      });
    }

    unrecList.appendChild(card);
  });
}

function updateAssocPanel() {
  if (!_panel) return;
  const r = _panel.refs;
  const hasU = !!_selectedUnrec;
  const hasS = !!_selectedStudy;

  if (hasU || hasS) {
    r.assocPanel.classList.add('visible');
    r.assocBtnDo.disabled = !(hasU && hasS);

    r.assocUnrecTitle.textContent = hasU
      ? (_selectedUnrec.aetitle || _selectedUnrec.studyUid || '—')
      : '— selecione um não reconhecido';
    r.assocUnrecMeta.textContent  = hasU ? (_selectedUnrec.datetime || '') : '';

    r.assocStudyTitle.textContent = hasS
      ? (_selectedStudy.patientName || '—')
      : '— selecione um exame reconhecido';
    r.assocStudyMeta.textContent  = hasS
      ? [_selectedStudy.description, _selectedStudy.accessionNumber].filter(Boolean).join(' · ')
      : '';
  } else {
    r.assocPanel.classList.remove('visible');
  }
}

function handleAssociate() {
  if (!_selectedUnrec || !_selectedStudy) return;

  const u = _selectedUnrec;
  const s = _selectedStudy;

  const ok = confirm(
    `Confirma associar este não reconhecido a este exame?\n\n` +
    `N/R: ${u.aetitle || u.studyUid} — ${u.datetime}\n` +
    `Exame: ${s.patientName} — ${s.accessionNumber}`
  );

  if (!ok) {
    addLog('Associação cancelada.', 'warn');
    return;
  }

  addLog(`Associando ${u.aetitle || u.studyUid} → ${s.patientName} (${s.accessionNumber})…`);

  const studyKey  = `${s.patientId}_${s.accessionNumber}`;
  const assocCode = s.associateOnclick.replace(
    /,\s*this\s*\)\s*;?\s*$/,
    `, document.querySelector('#STUDY_${studyKey} .study-item-status'));`
  );

  addLog(`exec: ${assocCode}`);
  executeInPageContext(assocCode);
  addLog('Associação executada. Verifique o sistema.', 'success');
}

function _setActionButtonsDisabled(disabled) {
  if (!_panel) return;
  _panel.shadow.querySelectorAll('.pbtn').forEach(b => { b.disabled = disabled; });
}

async function handleReadStudies() {
  if (!_panel) return;
  _selectedStudy = null;
  updateAssocPanel();
  _setActionButtonsDisabled(true);
  updateStatus('lendo', 'Lendo…');
  addLog('Buscando exames reconhecidos…');

  try {
    const ctx     = capturePageContext();
    const result  = await postAction('findStudies', ctx);
    const studies = parseStudiesHTML(result.html);

    if (!_panel) return;
    _panel.lastData = {
      ..._panel.lastData,
      studies,
      _rawStudiesHtml:       result.html,
      payloadFindStudies:    result.payload,
      responseStatusStudies: result.responseStatus,
      responseLenStudies:    result.responseLength,
      responsePreviewStudies:result.responsePreview,
      currentGroup:          ctx.group,
      currentFilter:         ctx.stdfilter,
      locationHref:          location.href,
      documentCookie:        document.cookie || null,
      _contextSources:       ctx._sources,
    };
    _panel.refs.btnExport.disabled = false;

    // Log 1: quantidade de .study-item encontrados no HTML
    const rawCount = (result.html.match(/class="[^"]*study-item/g) || []).length;
    addLog(`.study-item no HTML: ${rawCount}`, rawCount ? 'success' : 'warn');

    if (!studies.length) {
      addLog('Nenhum exame parseado.', 'warn');
      renderStudies([]);
    } else {
      // Log 2: primeiro item parseado
      const first = studies[0];
      addLog(`#1 → ${first.patientName || first.title || '?'} | ${first.modality || '?'} | ${first.datetime || '?'}`);

      // Log 3: quantidade renderizada
      renderStudies(studies);
      addLog(`${studies.length} exame(s) renderizado(s) no painel.`, 'success');
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
  _selectedUnrec = null;
  updateAssocPanel();
  _setActionButtonsDisabled(true);
  updateStatus('lendo', 'Lendo…');
  addLog('Buscando exames não reconhecidos…');

  try {
    const ctx    = capturePageContext();
    const result = await postAction('findUnrecPrints', ctx);
    const items  = parseUnrecPrintsHTML(result.html);

    if (!_panel) return;
    _panel.lastData = {
      ..._panel.lastData,
      unrecPrints: items,
      _rawUnrecHtml:        result.html,
      payloadFindUnrecPrints:   result.payload,
      responseStatusUnrec:  result.responseStatus,
      responseLenUnrec:     result.responseLength,
      responsePreviewUnrec: result.responsePreview,
      currentGroup:         ctx.group,
      currentFilter:        ctx.stdfilter,
      locationHref:         location.href,
      documentCookie:       document.cookie || null,
      _contextSources:      ctx._sources,
    };
    _panel.refs.btnExport.disabled = false;

    const rawCount = (result.html.match(/class="[^"]*unrec-item/g) || []).length;
    addLog(`.unrec-item no HTML: ${rawCount}`, rawCount ? 'success' : 'warn');

    if (!items.length) {
      addLog('Nenhum não reconhecido encontrado.', 'warn');
      renderUnrec([]);
    } else {
      const first = items[0];
      addLog(`#1 → ${first.aetitle || '?'} - ${first.datetime || '?'}`);
      renderUnrec(items);
      addLog(`${items.length} não reconhecido(s) renderizado(s).`, 'success');
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
      (async () => {
        try {
          const ctx = capturePageContext();
          const [rStudies, rUnrec] = await Promise.all([
            postAction('findStudies',     ctx),
            postAction('findUnrecPrints', ctx),
          ]);
          sendResponse({
            ok:                     true,
            sessionCaptured:        !!ctx.sessionid,
            studies:                parseStudiesHTML(rStudies.html),
            unrecPrints:            parseUnrecPrintsHTML(rUnrec.html),
            _rawStudiesHtml:        rStudies.html,
            _rawUnrecHtml:          rUnrec.html,
            payloadFindStudies:     rStudies.payload,
            payloadFindUnrecPrints: rUnrec.payload,
            currentGroup:           ctx.group,
            currentFilter:          ctx.stdfilter,
            locationHref:           location.href,
            documentCookie:         document.cookie || null,
            responseStatusStudies:  rStudies.responseStatus,
            responseLenStudies:     rStudies.responseLength,
            responsePreviewStudies: rStudies.responsePreview,
            _contextSources:        ctx._sources,
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
