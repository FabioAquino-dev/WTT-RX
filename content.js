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

let _panel = null;

// ── Pipeline state ─────────────────────────────────────────────────────────────
let _pipeline = {
  id:          0,      // incremented per run — stale observers check this
  stage:       'idle', // idle | loading | auto_matched | no_match | manual_mode | error
  unrec:       null,   // { studyUid, aetitle, datetime, onclick }
  meta:        null,   // { patientId, patientName, accessionNumber } | null
  metaLevel:   null,   // 'dom' | 'ocr' | null
  match:       null,   // { study, confidence: 'high'|'medium', matchedBy } | null
  manualStudy: null,   // study explicitly selected by user in Level 2
};

let _logEntries = []; // { time, text, type }
let _logFilter  = 'all';
let _logPaused  = false;

// ── Panel CSS (injected into Shadow DOM) ───────────────────────────────────────
const PANEL_CSS = `<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

#wttrx-resize-wrap { position: relative; width: 100%; height: 100%; }

.rh { position: absolute; z-index: 10; }
.rh--n  { top: -4px;    left: 8px;    right: 8px;   height: 8px;  cursor: n-resize;  }
.rh--s  { bottom: -4px; left: 8px;    right: 8px;   height: 8px;  cursor: s-resize;  }
.rh--e  { top: 8px;     right: -4px;  bottom: 8px;  width: 8px;   cursor: e-resize;  }
.rh--w  { top: 8px;     left: -4px;   bottom: 8px;  width: 8px;   cursor: w-resize;  }
.rh--ne { top: -6px;    right: -6px;  width: 14px;  height: 14px; cursor: ne-resize; }
.rh--nw { top: -6px;    left: -6px;   width: 14px;  height: 14px; cursor: nw-resize; }
.rh--se { bottom: -6px; right: -6px;  width: 14px;  height: 14px; cursor: se-resize; }
.rh--sw { bottom: -6px; left: -6px;   width: 14px;  height: 14px; cursor: sw-resize; }

#wttrx-panel {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px; color: #c9d1d9;
  background: #0d1117; border: 1px solid #30363d;
  border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.75);
  overflow: hidden;
}

/* ── Header ── */
#wttrx-header {
  display: flex; align-items: center; gap: 6px;
  padding: 0 8px; height: 36px; min-height: 36px;
  background: #161b22; border-bottom: 1px solid #21262d;
  cursor: grab; user-select: none; flex-shrink: 0;
}
#wttrx-header:active { cursor: grabbing; }

.panel-title {
  font-size: 11px; font-weight: 700; letter-spacing: .07em;
  color: #1e9af5; pointer-events: none; flex-shrink: 0;
}

.status-pill {
  display: flex; align-items: center; gap: 4px;
  flex: 1; pointer-events: none; min-width: 0;
}

.sdot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #484f58; flex-shrink: 0; transition: background .2s;
}
.sdot--ativo { background: #3fb950; }
.sdot--lendo { background: #58a6ff; animation: blink 1s ease-in-out infinite; }
.sdot--erro  { background: #da3633; }

@keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }

.slabel { font-size: 10px; color: #8b949e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pipe-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 8px; flex-shrink: 0; display: none;
}
.pipe-badge.visible          { display: inline-block; }
.pipe-badge--loading         { background: #161b22; color: #8b949e; animation: blink 1s ease-in-out infinite; }
.pipe-badge--matched         { background: #1a3a2a; color: #3fb950; }
.pipe-badge--nomatch         { background: #2d2a10; color: #d29922; }
.pipe-badge--manual          { background: #1a2033; color: #58a6ff; }
.pipe-badge--error           { background: #2d1515; color: #f85149; }

.ctrl {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #484f58; cursor: pointer;
  border-radius: 4px; font-size: 16px; line-height: 1;
  transition: background .15s, color .15s; flex-shrink: 0;
}
.ctrl:hover        { background: #21262d; color: #c9d1d9; }
.ctrl--close:hover { background: #6e2525; color: #f85149; }

/* ── Fixed actions section ── */
#wttrx-actions {
  padding: 8px 10px 6px; border-bottom: 1px solid #21262d;
  display: flex; flex-direction: column; gap: 5px; flex-shrink: 0;
}

/* ── Tabs bar ── */
#wttrx-tabs-bar {
  display: flex; border-bottom: 1px solid #21262d;
  flex-shrink: 0; background: #161b22;
}
.tab-btn {
  flex: 1; padding: 5px 0; background: transparent;
  border: none; border-bottom: 2px solid transparent;
  color: #8b949e; font-size: 11px; font-weight: 500;
  cursor: pointer; transition: color .12s, border-color .12s;
}
.tab-btn:hover   { color: #c9d1d9; }
.tab-btn--active { color: #1e9af5; border-bottom-color: #1e9af5; font-weight: 600; }

/* ── Tab content area ── */
#wttrx-tab-content {
  flex: 1; min-height: 0; position: relative; overflow: hidden;
}
.tab-panel {
  position: absolute; inset: 0; overflow-y: auto;
  padding: 10px; display: flex; flex-direction: column; gap: 8px;
}
.tab-panel::-webkit-scrollbar       { width: 4px; }
.tab-panel::-webkit-scrollbar-track { background: transparent; }
.tab-panel::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
.tab-panel::-webkit-scrollbar-thumb:hover { background: #484f58; }
.tab-panel--hidden { display: none; }

.tab-empty { font-size: 11px; color: #484f58; text-align: center; padding: 20px 0; }

/* ── Logs tab: toolbar fixed, list scrollable ── */
#wttrx-tab-logs { overflow-y: hidden; padding: 0; gap: 0; }

.log-toolbar {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
  padding: 6px 10px; border-bottom: 1px solid #21262d; flex-shrink: 0;
}
.log-ctrl {
  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border: none; background: #21262d; color: #8b949e; cursor: pointer;
  border-radius: 4px; font-size: 11px; transition: background .12s, color .12s; flex-shrink: 0;
}
.log-ctrl:hover   { background: #30363d; color: #c9d1d9; }
.log-ctrl--active { background: #1f6feb33; color: #58a6ff; }

.log-filters { display: flex; gap: 3px; margin-left: auto; flex-wrap: wrap; }

.log-filter {
  padding: 1px 6px; border: 1px solid #30363d; border-radius: 10px;
  background: transparent; color: #8b949e; font-size: 9px; font-weight: 600;
  cursor: pointer; transition: all .12s;
}
.log-filter:hover        { background: #21262d; color: #c9d1d9; }
.log-filter--active      { background: #1f6feb22; border-color: #1f6feb; color: #58a6ff; }
.log-filter--warn-active { background: #d2992222; border-color: #d29922; color: #d29922; }
.log-filter--err-active  { background: #f8514922; border-color: #f85149; color: #f85149; }
.log-filter--ok-active   { background: #3fb95022; border-color: #3fb950; color: #3fb950; }

.log-full {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 6px 10px; list-style: none;
  display: flex; flex-direction: column; gap: 2px;
}
.log-full::-webkit-scrollbar       { width: 4px; }
.log-full::-webkit-scrollbar-track { background: transparent; }
.log-full::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
.log-full::-webkit-scrollbar-thumb:hover { background: #484f58; }

.log-full-empty { font-size: 10px; color: #484f58; text-align: center; padding: 10px 0; }

.log-entry {
  font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #8b949e; line-height: 1.45; word-break: break-word;
}
.log-entry--success { color: #3fb950; }
.log-entry--error   { color: #f85149; }
.log-entry--warn    { color: #d29922; }

/* ── Footer ── */
#wttrx-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 10px; height: 22px; min-height: 22px;
  background: #0d1117; border-top: 1px solid #21262d;
  flex-shrink: 0; gap: 6px;
}
.footer-log {
  font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #484f58; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.footer-stage { font-size: 9px; font-weight: 700; color: #484f58; letter-spacing: .05em; flex-shrink: 0; }

/* ── Minimized: only header visible ── */
#wttrx-panel.is-minimized #wttrx-actions,
#wttrx-panel.is-minimized #wttrx-tabs-bar,
#wttrx-panel.is-minimized #wttrx-tab-content,
#wttrx-panel.is-minimized #wttrx-footer { display: none; }

/* ── Action buttons ── */
.panel-actions { display: flex; gap: 4px; }
.pbtn {
  flex: 1; padding: 5px 4px; border-radius: 5px; border: 1px solid transparent;
  font-size: 10px; font-weight: 500; cursor: pointer; text-align: center;
  transition: filter .15s, background .15s, opacity .15s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pbtn:disabled { opacity: .35; cursor: not-allowed; }
.pbtn--primary   { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.pbtn--primary:not(:disabled):hover   { filter: brightness(1.12); }
.pbtn--secondary { background: #21262d; color: #c9d1d9; border-color: #30363d; }
.pbtn--secondary:not(:disabled):hover { background: #2d333b; }
.pbtn--ghost { background: transparent; color: #8b949e; border-color: #21262d; }
.pbtn--ghost:not(:disabled):hover { color: #c9d1d9; border-color: #30363d; }

/* ── Group row ── */
.group-row { display: flex; align-items: center; gap: 5px; }
.group-label { font-size: 10px; color: #8b949e; flex-shrink: 0; }
.group-input {
  flex: 1; background: #010409; border: 1px solid #30363d; border-radius: 4px;
  color: #c9d1d9; font-size: 11px; font-family: ui-monospace, SFMono-Regular, monospace;
  padding: 3px 6px; outline: none; text-transform: uppercase;
}
.group-input:focus { border-color: #1f6feb; }
.group-input.saved { border-color: #238636; }

/* ── Section labels ── */
.section-label {
  font-size: 10px; font-weight: 600; color: #484f58;
  text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px;
}
.section-label--unrec { color: #d29922; }

/* ── Studies scroll ── */
.studies-scroll { display: flex; flex-direction: column; gap: 2px; }

/* ── Study cards ── */
.study-card {
  background: #161b22; border: 1px solid #21262d; border-radius: 4px;
  padding: 4px 7px; cursor: pointer; transition: border-color .12s, background .12s; user-select: none;
}
.study-card:hover     { border-color: #388bfd; background: #1c2333; }
.study-card--active   { border-color: #1f6feb; background: #0d2044; box-shadow: 0 0 0 1px #1f6feb22; }
.study-card--selected { border-color: #1f6feb; background: #0d1e36; }

.study-card__name {
  font-size: 11px; font-weight: 600; color: #c9d1d9;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;
}
.study-card__meta {
  font-size: 10px; color: #8b949e; margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.study-card__status {
  display: inline-block; font-size: 9px; padding: 1px 5px;
  border-radius: 10px; margin-top: 3px; font-weight: 500;
}
.study-card__status.status-empty   { background: #21262d; color: #8b949e; }
.study-card__status.status-toaprov { background: #1a3a2a; color: #3fb950; }

/* ── Unrec cards ── */
.unrec-card {
  background: #161b22; border: 1px solid #21262d; border-radius: 4px;
  padding: 5px 7px; cursor: pointer; transition: border-color .12s, background .12s;
  user-select: none; display: flex; align-items: center; justify-content: space-between; gap: 6px;
}
.unrec-card:hover   { border-color: #d29922; background: #1c1a0e; }
.unrec-card--active { border-color: #d29922; background: #1c1a0e; box-shadow: 0 0 0 1px #d2992222; }

.unrec-card__aetitle {
  font-size: 11px; font-weight: 600; color: #c9d1d9;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.unrec-card__datetime { font-size: 10px; color: #8b949e; flex-shrink: 0; }
.unrec-card__status {
  display: inline-block; font-size: 9px; padding: 1px 5px;
  border-radius: 10px; font-weight: 500; flex-shrink: 0;
}
.unrec-card__status.status-unrec { background: #2d1f0e; color: #d29922; }
.unrec-card__status.status-torec { background: #0d2a1a; color: #3fb950; }

/* ── Association panel ── */
#wttrx-assoc-panel {
  border: 1px solid #1f6feb; border-radius: 6px;
  background: #0d1117; padding: 8px;
  display: none; flex-direction: column; gap: 5px;
}
#wttrx-assoc-panel.visible { display: flex; }

.assoc-section__label {
  font-size: 9px; text-transform: uppercase;
  letter-spacing: 0.05em; color: #8b949e; margin-bottom: 1px;
}
.assoc-section__value {
  font-size: 11px; font-weight: 600; color: #c9d1d9;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.assoc-section__meta {
  font-size: 10px; color: #8b949e;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.assoc-divider { text-align: center; font-size: 10px; color: #8b949e; padding: 1px 0; }

.assoc-badge { display: inline-flex; gap: 4px; align-items: center; margin-top: 3px; flex-wrap: wrap; }
.assoc-tag { font-size: 9px; padding: 1px 5px; border-radius: 10px; font-weight: 600; }
.assoc-tag--high    { background: #1a3a2a; color: #3fb950; }
.assoc-tag--medium  { background: #2d2a10; color: #d29922; }
.assoc-tag--manual  { background: #1a2033; color: #58a6ff; }
.assoc-tag--loading { background: #161b22; color: #8b949e; animation: blink 1s ease-in-out infinite; }
.assoc-tag--dom     { background: #10202f; color: #388bfd; }
.assoc-tag--ocr     { background: #1f1030; color: #bc8cff; }

.assoc-btn {
  width: 100%; padding: 5px; background: #1f6feb; color: #fff;
  border: none; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 600; margin-top: 2px;
}
.assoc-btn:hover:not(:disabled) { background: #388bfd; }
.assoc-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.assoc-hint { font-size: 11px; color: #484f58; text-align: center; padding: 20px 0; }
</style>`;

// ── Panel HTML ─────────────────────────────────────────────────────────────────
const PANEL_HTML = `
<div id="wttrx-resize-wrap">
  <div class="rh rh--n"  data-dir="n"></div>
  <div class="rh rh--s"  data-dir="s"></div>
  <div class="rh rh--e"  data-dir="e"></div>
  <div class="rh rh--w"  data-dir="w"></div>
  <div class="rh rh--ne" data-dir="ne"></div>
  <div class="rh rh--nw" data-dir="nw"></div>
  <div class="rh rh--se" data-dir="se"></div>
  <div class="rh rh--sw" data-dir="sw"></div>
  <div id="wttrx-panel">
    <div id="wttrx-header">
      <span class="panel-title">WTT-RX</span>
      <div class="status-pill">
        <span class="sdot" id="wttrx-sdot"></span>
        <span class="slabel" id="wttrx-slabel">Parado</span>
      </div>
      <span class="pipe-badge" id="wttrx-pipe-badge"></span>
      <button class="ctrl"             id="wttrx-min"   title="Minimizar">−</button>
      <button class="ctrl ctrl--close" id="wttrx-close" title="Fechar">×</button>
    </div>
    <div id="wttrx-actions">
      <div class="group-row">
        <span class="group-label">Grupo:</span>
        <input class="group-input" id="wttrx-group-input" type="text" placeholder="ex: RAIOX" maxlength="32" autocomplete="off" spellcheck="false" />
      </div>
      <div class="panel-actions">
        <button class="pbtn pbtn--primary"   id="wttrx-btn-studies">Reconhecidos</button>
        <button class="pbtn pbtn--secondary" id="wttrx-btn-unrec"  >Não reconhecidos</button>
        <button class="pbtn pbtn--ghost"     id="wttrx-btn-export"  disabled>Exportar</button>
      </div>
    </div>
    <div id="wttrx-tabs-bar">
      <button class="tab-btn tab-btn--active" data-tab="exames">Exames</button>
      <button class="tab-btn" data-tab="assoc">Associação</button>
      <button class="tab-btn" data-tab="logs">Logs</button>
    </div>
    <div id="wttrx-tab-content">
      <div class="tab-panel" id="wttrx-tab-exames">
        <p class="tab-empty" id="wttrx-exames-empty">Nenhum exame carregado. Use os botões acima.</p>
        <div id="wttrx-studies-wrap" style="display:none;">
          <div class="section-label">Exames (<span id="wttrx-studies-count">0</span>)</div>
          <div class="studies-scroll" id="wttrx-studies-list"></div>
        </div>
        <div id="wttrx-unrec-wrap" style="display:none;">
          <div class="section-label section-label--unrec">Não reconhecidos (<span id="wttrx-unrec-count">0</span>)</div>
          <div class="studies-scroll" id="wttrx-unrec-list"></div>
        </div>
      </div>
      <div class="tab-panel tab-panel--hidden" id="wttrx-tab-assoc">
        <p class="assoc-hint" id="wttrx-assoc-hint">Clique em um exame não reconhecido na aba Exames.</p>
        <div id="wttrx-assoc-panel">
          <div>
            <div class="assoc-section__label">Não reconhecido</div>
            <div class="assoc-section__value" id="wttrx-assoc-unrec-title">—</div>
            <div class="assoc-section__meta"  id="wttrx-assoc-unrec-meta"></div>
          </div>
          <div class="assoc-divider">↓ associar a ↓</div>
          <div>
            <div class="assoc-section__label">Correspondência</div>
            <div class="assoc-section__value" id="wttrx-assoc-study-title">—</div>
            <div class="assoc-section__meta"  id="wttrx-assoc-study-meta"></div>
            <div class="assoc-badge"          id="wttrx-assoc-badges"></div>
          </div>
          <button class="assoc-btn" id="wttrx-btn-associate" disabled>Associar automaticamente</button>
        </div>
      </div>
      <div class="tab-panel tab-panel--hidden" id="wttrx-tab-logs">
        <div class="log-toolbar">
          <button class="log-ctrl" id="wttrx-log-pause" title="Pausar scroll">⏸</button>
          <button class="log-ctrl" id="wttrx-log-copy"  title="Copiar logs">⎘</button>
          <button class="log-ctrl" id="wttrx-log-clear" title="Limpar logs">✕</button>
          <div class="log-filters">
            <button class="log-filter log-filter--active" data-filter="all">TUDO</button>
            <button class="log-filter" data-filter="info">INFO</button>
            <button class="log-filter" data-filter="warn">WARN</button>
            <button class="log-filter" data-filter="error">ERROR</button>
            <button class="log-filter" data-filter="success">OK</button>
          </div>
        </div>
        <ul class="log-full" id="wttrx-log-full"></ul>
      </div>
    </div>
    <div id="wttrx-footer">
      <span class="footer-log"   id="wttrx-footer-log">—</span>
      <span class="footer-stage" id="wttrx-footer-stage">IDLE</span>
    </div>
  </div>
</div>`;

// Executa código no contexto MAIN da página via background service worker.
// chrome.scripting.executeScript(world:'MAIN') acessa getStdPrints/associate sem violar CSP.
function executeInPageContext(code) {
  chrome.runtime.sendMessage({ action: 'EXEC_IN_PAGE', code }, response => {
    if (chrome.runtime.lastError) {
      addLog(`Exec falhou: ${chrome.runtime.lastError.message}`, 'error');
    } else if (response && !response.ok) {
      addLog(`Exec erro: ${response.error || '?'}`, 'error');
    }
  });
}

// ── Panel functions ────────────────────────────────────────────────────────────

function createPanel() {
  if (_panel) return;

  const host = document.createElement('div');
  host.id = 'wttrx-panel-host';
  const _st    = _loadPanelState();
  const _initW = _st?.width  ?? PANEL_DEFAULTS.width;
  const _initH = _st?.height ?? PANEL_DEFAULTS.height;
  const _initL = _st?.left   ?? (window.innerWidth - _initW - 20);
  const _initT = _st?.top    ?? 20;
  host.style.cssText =
    `position:fixed;left:${_initL}px;top:${_initT}px;` +
    `width:${_initW}px;height:${_initH}px;z-index:2147483647;`;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = PANEL_CSS + PANEL_HTML;
  document.body.appendChild(host);

  _panel = {
    host,
    shadow,
    minimized:   false,
    maximized:   false,
    savedHeight: null,
    savedRect:   null,
    activeTab:   _st?.activeTab ?? 'exames',
    lastData:    null,
    refs: {
      sdot:            shadow.querySelector('#wttrx-sdot'),
      slabel:          shadow.querySelector('#wttrx-slabel'),
      pipeBadge:       shadow.querySelector('#wttrx-pipe-badge'),
      btnMin:          shadow.querySelector('#wttrx-min'),
      btnExport:       shadow.querySelector('#wttrx-btn-export'),
      tabBtns:         shadow.querySelectorAll('.tab-btn'),
      tabPanels:       shadow.querySelectorAll('.tab-panel'),
      studiesWrap:     shadow.querySelector('#wttrx-studies-wrap'),
      studiesList:     shadow.querySelector('#wttrx-studies-list'),
      studiesCount:    shadow.querySelector('#wttrx-studies-count'),
      unrecWrap:       shadow.querySelector('#wttrx-unrec-wrap'),
      unrecList:       shadow.querySelector('#wttrx-unrec-list'),
      unrecCount:      shadow.querySelector('#wttrx-unrec-count'),
      examesEmpty:     shadow.querySelector('#wttrx-exames-empty'),
      assocPanel:      shadow.querySelector('#wttrx-assoc-panel'),
      assocHint:       shadow.querySelector('#wttrx-assoc-hint'),
      assocBtnDo:      shadow.querySelector('#wttrx-btn-associate'),
      assocUnrecTitle: shadow.querySelector('#wttrx-assoc-unrec-title'),
      assocUnrecMeta:  shadow.querySelector('#wttrx-assoc-unrec-meta'),
      assocStudyTitle: shadow.querySelector('#wttrx-assoc-study-title'),
      assocStudyMeta:  shadow.querySelector('#wttrx-assoc-study-meta'),
      assocBadges:     shadow.querySelector('#wttrx-assoc-badges'),
      groupInput:      shadow.querySelector('#wttrx-group-input'),
      logFull:         shadow.querySelector('#wttrx-log-full'),
      footerLog:       shadow.querySelector('#wttrx-footer-log'),
      footerStage:     shadow.querySelector('#wttrx-footer-stage'),
    },
  };

  // Restore saved group
  const savedGroup = localStorage.getItem('wttrx_group') || '';
  _panel.refs.groupInput.value = savedGroup;
  if (savedGroup) _panel.refs.groupInput.classList.add('saved');

  _panel.refs.groupInput.addEventListener('input', () => {
    const v = _panel.refs.groupInput.value.trim().toUpperCase();
    _panel.refs.groupInput.value = v;
    localStorage.setItem('wttrx_group', v);
    _panel.refs.groupInput.classList.toggle('saved', !!v);
  });

  // Tab buttons
  _panel.refs.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Log toolbar
  const logPauseBtn = shadow.querySelector('#wttrx-log-pause');
  logPauseBtn.addEventListener('click', () => {
    _logPaused = !_logPaused;
    logPauseBtn.classList.toggle('log-ctrl--active', _logPaused);
    logPauseBtn.title = _logPaused ? 'Retomar scroll' : 'Pausar scroll';
  });

  shadow.querySelector('#wttrx-log-copy').addEventListener('click', () => {
    const filtered = _logFilter === 'all' ? _logEntries : _logEntries.filter(e => e.type === _logFilter);
    const text = filtered.map(e => `[${e.time}] ${e.text}`).join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    addLog('Logs copiados para a área de transferência.', 'success');
  });

  shadow.querySelector('#wttrx-log-clear').addEventListener('click', () => {
    _logEntries = [];
    _renderLogList();
    if (_panel?.refs.footerLog) _panel.refs.footerLog.textContent = '—';
  });

  // Log filter chips
  shadow.querySelectorAll('.log-filter').forEach(chip => {
    chip.addEventListener('click', () => {
      _logFilter = chip.dataset.filter;
      const activeClassMap = { all: 'log-filter--active', info: 'log-filter--active', warn: 'log-filter--warn-active', error: 'log-filter--err-active', success: 'log-filter--ok-active' };
      shadow.querySelectorAll('.log-filter').forEach(c => {
        c.classList.remove('log-filter--active', 'log-filter--warn-active', 'log-filter--err-active', 'log-filter--ok-active');
        if (c.dataset.filter === _logFilter) c.classList.add(activeClassMap[_logFilter] || 'log-filter--active');
      });
      _renderLogList();
    });
  });

  // Header controls
  shadow.querySelector('#wttrx-min').addEventListener('click', () =>
    _panel.minimized ? restorePanel() : minimizePanel()
  );
  shadow.querySelector('#wttrx-close').addEventListener('click', removePanel);

  // Double-click header = maximize / restore
  shadow.querySelector('#wttrx-header').addEventListener('dblclick', e => {
    if (e.target.closest('button')) return;
    if (_panel.minimized) return;
    _panel.maximized ? restoreFromMaximize() : maximizePanel();
  });

  shadow.querySelector('#wttrx-btn-studies').addEventListener('click', handleReadStudies);
  shadow.querySelector('#wttrx-btn-unrec').addEventListener('click', handleReadUnrec);
  shadow.querySelector('#wttrx-btn-export').addEventListener('click', handleExport);
  shadow.querySelector('#wttrx-btn-associate').addEventListener('click', handleAutoAssociate);

  makeDraggable(host, shadow.querySelector('#wttrx-header'));
  makeResizable(host, shadow);
  updateStatus('ativo', 'Ativo');

  // Activate saved tab and replay existing log entries
  activateTab(_panel.activeTab);
  _renderLogList();
  addLog('Painel WTT-RX iniciado');

  if (_st?.minimized) {
    _panel.savedHeight = _initH;
    minimizePanel();
  }
}

function removePanel() {
  if (!_panel) return;
  _panel.host.remove();
  _panel = null;
}

function minimizePanel() {
  if (!_panel || _panel.minimized) return;
  _panel.savedHeight = parseInt(_panel.host.style.height, 10) || PANEL_DEFAULTS.height;
  _panel.host.style.height = '36px';
  _panel.shadow.querySelector('#wttrx-panel').classList.add('is-minimized');
  _panel.minimized = true;
  _panel.refs.btnMin.textContent = '+';
  _panel.refs.btnMin.title = 'Restaurar';
  _savePanelState(_panel.host);
}

function restorePanel() {
  if (!_panel || !_panel.minimized) return;
  _panel.host.style.height = (_panel.savedHeight ?? PANEL_DEFAULTS.height) + 'px';
  _panel.shadow.querySelector('#wttrx-panel').classList.remove('is-minimized');
  _panel.minimized = false;
  _panel.refs.btnMin.textContent = '−';
  _panel.refs.btnMin.title = 'Minimizar';
  _savePanelState(_panel.host);
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
  const time = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  _logEntries.push({ time, text, type });
  if (_logEntries.length > 200) _logEntries.shift();

  if (!_panel) return;

  _panel.refs.footerLog.textContent = `${time} ${text}`;
  _renderLogList();
}

// ── Panel state persistence ────────────────────────────────────────────────────

const PANEL_DEFAULTS = { width: 380, height: 540 };
const PANEL_MIN_W    = 360;
const PANEL_MIN_H    = 420;

function _savePanelState(host) {
  localStorage.setItem('wttrx_state', JSON.stringify({
    left:      parseInt(host.style.left,  10) || 0,
    top:       parseInt(host.style.top,   10) || 0,
    width:     parseInt(host.style.width, 10) || PANEL_DEFAULTS.width,
    height:    _panel?.minimized
                 ? (_panel.savedHeight ?? PANEL_DEFAULTS.height)
                 : (parseInt(host.style.height, 10) || PANEL_DEFAULTS.height),
    minimized: _panel?.minimized ?? false,
    activeTab: _panel?.activeTab ?? 'exames',
  }));
}

function _loadPanelState() {
  try {
    const s = JSON.parse(localStorage.getItem('wttrx_state'));
    if (s && typeof s.width === 'number') return s;
  } catch {}
  return null;
}

function activateTab(name) {
  if (!_panel) return;
  _panel.refs.tabBtns.forEach(btn => {
    btn.classList.toggle('tab-btn--active', btn.dataset.tab === name);
  });
  _panel.refs.tabPanels.forEach(p => {
    p.classList.toggle('tab-panel--hidden', p.id !== `wttrx-tab-${name}`);
  });
  _panel.activeTab = name;
  _savePanelState(_panel.host);
}

function maximizePanel() {
  if (!_panel || _panel.minimized) return;
  _panel.savedRect = {
    left:   parseInt(_panel.host.style.left,   10) || 0,
    top:    parseInt(_panel.host.style.top,    10) || 0,
    width:  parseInt(_panel.host.style.width,  10) || PANEL_DEFAULTS.width,
    height: parseInt(_panel.host.style.height, 10) || PANEL_DEFAULTS.height,
  };
  const m = 10;
  _panel.host.style.left   = m + 'px';
  _panel.host.style.top    = m + 'px';
  _panel.host.style.width  = (window.innerWidth  - m * 2) + 'px';
  _panel.host.style.height = (window.innerHeight - m * 2) + 'px';
  _panel.maximized = true;
}

function restoreFromMaximize() {
  if (!_panel || !_panel.maximized) return;
  const r = _panel.savedRect;
  if (r) {
    _panel.host.style.left   = r.left   + 'px';
    _panel.host.style.top    = r.top    + 'px';
    _panel.host.style.width  = r.width  + 'px';
    _panel.host.style.height = r.height + 'px';
  }
  _panel.maximized = false;
  _savePanelState(_panel.host);
}

function _renderLogList() {
  if (!_panel?.refs.logFull) return;
  const ul = _panel.refs.logFull;
  const entries = _logFilter === 'all'
    ? _logEntries
    : _logEntries.filter(e => e.type === _logFilter);

  ul.innerHTML = '';

  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'log-full-empty';
    li.textContent = _logFilter === 'all' ? 'Nenhuma atividade ainda.' : 'Sem entradas com este filtro.';
    ul.appendChild(li);
    return;
  }

  entries.forEach(e => {
    const li = document.createElement('li');
    li.className = `log-entry${e.type !== 'info' ? ` log-entry--${e.type}` : ''}`;
    li.textContent = `[${e.time}] ${e.text}`;
    ul.appendChild(li);
  });

  if (!_logPaused) ul.scrollTop = ul.scrollHeight;
}

function _updateExamesEmpty() {
  if (!_panel?.refs.examesEmpty) return;
  const hasStudies = _panel.refs.studiesWrap.style.display !== 'none';
  const hasUnrec   = _panel.refs.unrecWrap.style.display   !== 'none';
  _panel.refs.examesEmpty.style.display = (hasStudies || hasUnrec) ? 'none' : '';
}

// ── Drag (header) ──────────────────────────────────────────────────────────────

function makeDraggable(host, handle) {
  let dragging = false;
  let dragOffX = 0, dragOffY = 0;

  handle.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    dragging = true;
    const rect = host.getBoundingClientRect();
    dragOffX = e.clientX - rect.left;
    dragOffY = e.clientY - rect.top;
    host.style.left   = rect.left + 'px';
    host.style.top    = rect.top  + 'px';
    host.style.right  = '';
    host.style.bottom = '';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const maxL = window.innerWidth  - host.offsetWidth;
    const maxT = window.innerHeight - host.offsetHeight;
    host.style.left = Math.max(0, Math.min(maxL, e.clientX - dragOffX)) + 'px';
    host.style.top  = Math.max(0, Math.min(maxT, e.clientY - dragOffY)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    _savePanelState(host);
  });
}

// ── Resize (8 handles) ─────────────────────────────────────────────────────────

function makeResizable(host, shadow) {
  shadow.querySelectorAll('.rh').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      if (_panel?.minimized) return;  // no resize when collapsed
      e.stopPropagation();
      e.preventDefault();

      const dir       = handle.dataset.dir;
      const startX    = e.clientX;
      const startY    = e.clientY;
      const startRect = host.getBoundingClientRect();

      const onMove = e => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxW = Math.floor(window.innerWidth  * 0.95);
        const maxH = Math.floor(window.innerHeight * 0.95);

        let { left, top, width, height } = {
          left:   startRect.left,
          top:    startRect.top,
          width:  startRect.width,
          height: startRect.height,
        };

        if (dir.includes('e')) {
          width = Math.max(PANEL_MIN_W, Math.min(maxW, width + dx));
        }
        if (dir.includes('s')) {
          height = Math.max(PANEL_MIN_H, Math.min(maxH, height + dy));
        }
        if (dir.includes('w')) {
          const nw = Math.max(PANEL_MIN_W, Math.min(maxW, width - dx));
          left  = left + (width - nw);
          width = nw;
        }
        if (dir.includes('n')) {
          const nh = Math.max(PANEL_MIN_H, Math.min(maxH, height - dy));
          top    = top + (height - nh);
          height = nh;
        }

        host.style.left   = left   + 'px';
        host.style.top    = top    + 'px';
        host.style.width  = width  + 'px';
        host.style.height = height + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        _savePanelState(host);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  });
}

// ── Panel action handlers ──────────────────────────────────────────────────────

function renderStudies(studies) {
  if (!_panel) return;
  const { studiesWrap, studiesList, studiesCount } = _panel.refs;

  studiesList.innerHTML = '';

  if (!studies.length) {
    studiesWrap.style.display = 'none';
    _updateExamesEmpty();
    return;
  }

  studiesCount.textContent = studies.length;
  studiesWrap.style.display = '';
  _updateExamesEmpty();
  activateTab('exames');

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
        executeInPageContext(s.onclick);
        addLog(`Abrindo exame ${s.accessionNumber} — ${s.patientName || '?'}`);

        // Level 2: if pipeline needs a manual selection, register it
        if (_pipeline.stage === 'manual_mode' || _pipeline.stage === 'no_match') {
          studiesList.querySelectorAll('.study-card--selected')
            .forEach(c => c.classList.remove('study-card--selected'));
          card.classList.add('study-card--selected');
          _pipeline.manualStudy = s;
          _pipeline.stage       = 'manual_mode';
          refreshAssocPanel();
        }
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
    _updateExamesEmpty();
    return;
  }

  unrecCount.textContent = items.length;
  unrecWrap.style.display = '';
  _updateExamesEmpty();
  activateTab('exames');

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
        unrecList.querySelectorAll('.unrec-card--active')
          .forEach(c => c.classList.remove('unrec-card--active'));
        card.classList.add('unrec-card--active');
        runAutoAssocPipeline(u);
      });
    }

    unrecList.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2b — Auto-association pipeline (3-level)
// ─────────────────────────────────────────────────────────────────────────────

// Level 3 stub — OCR not yet implemented
async function extractMetadataByOCR(_studyUid) {
  addLog('OCR ainda não implementado. Modo manual necessário.', 'warn');
  return null;
}

// Parse alt text of thumb images.
// Format: "patientId-patientName-modality-...description...-accessionNumber-DD/MM/YYYY"
function parseThumbAlt(alt) {
  if (!alt) return null;
  const parts = alt.split('-');
  if (parts.length < 4) return null;

  const patientId      = parts[0].trim();
  const patientName    = parts[1].trim();
  const lastPart       = parts[parts.length - 1].trim();
  const secondLast     = parts[parts.length - 2].trim();

  if (!/^\d+$/.test(patientId))                     return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(lastPart))     return null;
  if (!/^\d+$/.test(secondLast))                    return null;

  return { patientId, patientName, accessionNumber: secondLast };
}

// Level 1 — try to extract patient metadata from DOM injected by getStdPrints
function extractStudyMetadataFromDOM(studyUid) {
  let patientId = null;

  // Source A: hidden input injected by PACS after study loads
  const hiddenInput = document.querySelector(`input[id="RECO_PATID_${studyUid}"]`);
  if (hiddenInput?.value) patientId = hiddenInput.value.trim();

  // Source B: thumb image alt text
  let patientName = null, accessionNumber = null;
  const imgs = document.querySelectorAll('img.thumb-image[alt]');
  for (const img of imgs) {
    const parsed = parseThumbAlt(img.getAttribute('alt') || '');
    if (!parsed) continue;
    // Don't mix data from a different patient
    if (patientId && parsed.patientId !== patientId) continue;
    patientId       = patientId || parsed.patientId;
    patientName     = parsed.patientName;
    accessionNumber = parsed.accessionNumber;
    break;
  }

  if (!patientId && !accessionNumber) return null;
  return { patientId, patientName, accessionNumber };
}

// Wait for PACS to render study images, then extract metadata.
// Resolves with metadata object or null (never rejects — null means "not found").
function waitForStudyRender(studyUid, pipelineId, timeoutMs = 10000) {
  return new Promise(resolve => {
    // Immediate check before mounting observer
    const immediate = extractStudyMetadataFromDOM(studyUid);
    if (immediate) { resolve(immediate); return; }

    let settled = false;

    const settle = meta => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(meta);
    };

    const timer = setTimeout(() => settle(null), timeoutMs);

    const observer = new MutationObserver(() => {
      if (_pipeline.id !== pipelineId) { settle(null); return; } // cancelled
      const meta = extractStudyMetadataFromDOM(studyUid);
      if (meta) settle(meta);
    });

    observer.observe(document.body, {
      childList:       true,
      subtree:         true,
      attributes:      true,
      attributeFilter: ['alt', 'value'],
    });
  });
}

// Find best match in recognized studies list
function findMatchInStudies(meta, studies) {
  if (!studies?.length || !meta) return null;

  if (meta.accessionNumber) {
    const s = studies.find(s => s.accessionNumber?.trim() === meta.accessionNumber.trim());
    if (s) return { study: s, confidence: 'high', matchedBy: 'accession' };
  }

  if (meta.patientId) {
    const s = studies.find(s => s.patientId?.trim() === meta.patientId.trim());
    if (s) return { study: s, confidence: 'medium', matchedBy: 'patientId' };
  }

  return null;
}

// Main pipeline orchestrator — called on every unrec card click
async function runAutoAssocPipeline(unrecItem) {
  const pipelineId = ++_pipeline.id;

  _pipeline = {
    id:          pipelineId,
    stage:       'loading',
    unrec:       unrecItem,
    meta:        null,
    metaLevel:   null,
    match:       null,
    manualStudy: null,
  };

  refreshAssocPanel();
  addLog(`Iniciando pipeline: ${unrecItem.aetitle || '?'} — ${unrecItem.datetime || '?'}`);

  // Open study images in page context
  executeInPageContext(unrecItem.onclick);
  addLog(`getStdPrints disparado para UID ${unrecItem.studyUid || '?'}`);
  addLog('Aguardando render das imagens (até 10s)…');

  // ── Level 1: DOM metadata ───────────────────────────────────────────────────
  const domMeta = await waitForStudyRender(unrecItem.studyUid, pipelineId);

  if (_pipeline.id !== pipelineId) return; // cancelled by a newer click

  if (domMeta) {
    addLog(`DOM → patientId: ${domMeta.patientId || '?'} | accession: ${domMeta.accessionNumber || '?'}`, 'success');
    _pipeline.meta      = domMeta;
    _pipeline.metaLevel = 'dom';

    const studies = _panel?.lastData?.studies || [];
    const match   = findMatchInStudies(domMeta, studies);

    if (match) {
      _pipeline.match = match;
      _pipeline.stage = 'auto_matched';
      const conf = match.confidence === 'high' ? 'Alta' : 'Média';
      addLog(`Match por ${match.matchedBy}: ${match.study.patientName} (${match.study.accessionNumber}) — Confiança: ${conf}`, 'success');
    } else {
      _pipeline.stage = 'no_match';
      addLog('Dados extraídos mas sem match nos reconhecidos. Selecione manualmente.', 'warn');
    }

    refreshAssocPanel();
    return;
  }

  // ── Level 3 stub: OCR ───────────────────────────────────────────────────────
  addLog('DOM: sem dados estruturados. Tentando OCR…', 'warn');
  const ocrMeta = await extractMetadataByOCR(unrecItem.studyUid);

  if (_pipeline.id !== pipelineId) return;

  if (ocrMeta) {
    _pipeline.meta      = ocrMeta;
    _pipeline.metaLevel = 'ocr';
    const match = findMatchInStudies(ocrMeta, _panel?.lastData?.studies || []);
    _pipeline.match = match;
    _pipeline.stage = match ? 'auto_matched' : 'no_match';
    refreshAssocPanel();
    return;
  }

  // ── Level 2: manual ─────────────────────────────────────────────────────────
  addLog('Nenhum dado estruturado encontrado. Selecione o exame correspondente manualmente.', 'warn');
  _pipeline.stage = 'manual_mode';
  refreshAssocPanel();
}

// Render the assoc confirmation panel based on current _pipeline state
function refreshAssocPanel() {
  if (!_panel) return;
  const r = _panel.refs;
  const p = _pipeline;

  // Update header pipeline badge
  const badgeMap = {
    idle:         null,
    loading:      ['loading', 'DOM…'],
    auto_matched: ['matched', p.metaLevel === 'ocr' ? 'OCR ✓' : 'DOM ✓'],
    no_match:     ['nomatch', 'NO MATCH'],
    manual_mode:  ['manual',  p.manualStudy ? 'MANUAL ✓' : 'MANUAL'],
    error:        ['error',   'ERRO'],
  };
  const badgeInfo = badgeMap[p.stage];
  if (badgeInfo) {
    r.pipeBadge.className  = `pipe-badge visible pipe-badge--${badgeInfo[0]}`;
    r.pipeBadge.textContent = badgeInfo[1];
  } else {
    r.pipeBadge.className  = 'pipe-badge';
    r.pipeBadge.textContent = '';
  }

  // Update footer stage
  r.footerStage.textContent = p.stage.replace('_', ' ').toUpperCase();

  if (p.stage === 'idle') {
    r.assocPanel.classList.remove('visible');
    r.assocHint.style.display = '';
    return;
  }

  // Auto-switch to Associação tab and show assoc panel
  activateTab('assoc');
  r.assocHint.style.display = 'none';
  r.assocPanel.classList.add('visible');

  // Unrec section
  r.assocUnrecTitle.textContent = p.unrec
    ? (p.unrec.aetitle || p.unrec.studyUid || '—')
    : '— clique em um não reconhecido';

  const unrecMetaParts = [];
  if (p.unrec?.datetime)         unrecMetaParts.push(p.unrec.datetime);
  if (p.meta?.patientId)         unrecMetaParts.push(`ID: ${p.meta.patientId}`);
  if (p.meta?.accessionNumber)   unrecMetaParts.push(`Acc: ${p.meta.accessionNumber}`);
  r.assocUnrecMeta.textContent = unrecMetaParts.join(' · ');

  // Badges helper
  const setBadges = (tags) => {
    r.assocBadges.innerHTML = '';
    tags.forEach(([cls, text]) => {
      const span = document.createElement('span');
      span.className = `assoc-tag ${cls}`;
      span.textContent = text;
      r.assocBadges.appendChild(span);
    });
  };

  switch (p.stage) {
    case 'loading':
      r.assocStudyTitle.textContent = 'Extraindo dados da imagem…';
      r.assocStudyMeta.textContent  = '';
      setBadges([['assoc-tag--loading', 'Aguardando render']]);
      r.assocBtnDo.disabled    = true;
      r.assocBtnDo.textContent = 'Associar automaticamente';
      break;

    case 'auto_matched': {
      const { study, confidence, matchedBy } = p.match;
      const confLabel  = confidence === 'high' ? 'Alta' : 'Média';
      const confClass  = confidence === 'high' ? 'assoc-tag--high' : 'assoc-tag--medium';
      const levelLabel = p.metaLevel === 'dom' ? 'DOM' : 'OCR';
      const levelClass = p.metaLevel === 'dom' ? 'assoc-tag--dom' : 'assoc-tag--ocr';
      r.assocStudyTitle.textContent = study.patientName || '—';
      r.assocStudyMeta.textContent  = [study.accessionNumber, study.modality, study.description]
        .filter(Boolean).join(' · ');
      setBadges([
        [levelClass,  `Nível: ${levelLabel}`],
        [confClass,   `Confiança: ${confLabel}`],
        ['assoc-tag--dom', `por ${matchedBy}`],
      ]);
      r.assocBtnDo.disabled    = false;
      r.assocBtnDo.textContent = 'Associar automaticamente';
      break;
    }

    case 'no_match': {
      const levelLabel = p.metaLevel === 'dom' ? 'DOM' : (p.metaLevel || '?');
      r.assocStudyTitle.textContent = 'Sem correspondência automática';
      r.assocStudyMeta.textContent  = 'Clique no exame correspondente na lista acima';
      setBadges([
        [p.metaLevel === 'dom' ? 'assoc-tag--dom' : 'assoc-tag--loading', `Nível: ${levelLabel}`],
        ['assoc-tag--medium', 'Sem match'],
      ]);
      r.assocBtnDo.disabled    = true;
      r.assocBtnDo.textContent = 'Associar manualmente';
      break;
    }

    case 'manual_mode':
      r.assocStudyTitle.textContent = p.manualStudy
        ? (p.manualStudy.patientName || '—')
        : '— selecione um exame reconhecido acima';
      r.assocStudyMeta.textContent = p.manualStudy
        ? [p.manualStudy.accessionNumber, p.manualStudy.modality].filter(Boolean).join(' · ')
        : '';
      setBadges(p.manualStudy
        ? [['assoc-tag--manual', 'Nível: Manual'], ['assoc-tag--manual', 'Confirmação explícita']]
        : [['assoc-tag--loading', 'Aguardando seleção manual']]
      );
      r.assocBtnDo.disabled    = !p.manualStudy;
      r.assocBtnDo.textContent = 'Associar manualmente';
      break;

    case 'error':
      r.assocStudyTitle.textContent = 'Erro no pipeline';
      r.assocStudyMeta.textContent  = '';
      setBadges([]);
      r.assocBtnDo.disabled = true;
      break;
  }
}

function handleAutoAssociate() {
  const p = _pipeline;
  if (p.stage !== 'auto_matched' && p.stage !== 'manual_mode') return;

  const study = p.stage === 'auto_matched' ? p.match.study : p.manualStudy;
  if (!study || !p.unrec) return;

  const isAuto   = p.stage === 'auto_matched';
  const confLabel = isAuto
    ? `Confiança: ${p.match.confidence === 'high' ? 'Alta' : 'Média'} (por ${p.match.matchedBy})`
    : 'Confirmação manual explícita';
  const levelLabel = p.metaLevel
    ? `Nível: ${p.metaLevel.toUpperCase()}`
    : 'Nível: Manual';

  const ok = confirm(
    `Confirma a associação?\n\n` +
    `Não reconhecido: ${p.unrec.aetitle || p.unrec.studyUid} — ${p.unrec.datetime || '?'}\n` +
    `Exame: ${study.patientName} — ${study.accessionNumber}\n\n` +
    `${levelLabel} · ${confLabel}`
  );

  if (!ok) {
    addLog('Associação cancelada.', 'warn');
    return;
  }

  if (!study.associateOnclick) {
    addLog('Erro: associateOnclick não disponível para este exame.', 'error');
    return;
  }

  addLog(`Associando ${p.unrec.aetitle || p.unrec.studyUid} → ${study.patientName} (${study.accessionNumber})…`);

  const assocCode = study.associateOnclick.replace(
    /,\s*this\s*\)\s*;?\s*$/,
    `, document.querySelector('[id="STUDY_${study.patientId}_${study.accessionNumber}"] .study-item-status'));`
  );

  addLog(`exec: ${assocCode}`);
  executeInPageContext(assocCode);
  addLog(`Associação ${isAuto ? 'automática' : 'manual'} executada. Verifique o sistema.`, 'success');

  // Reset pipeline after successful association
  _pipeline.stage = 'idle';
  refreshAssocPanel();
}

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
