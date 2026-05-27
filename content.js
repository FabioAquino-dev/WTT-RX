'use strict';

const ENDPOINT = '/pserver/DprintMI2.exe';

// ── Session capture ────────────────────────────────────────────────────────────
// Tries multiple sources in order of reliability for legacy systems.
// Even when null, fetch with credentials:'include' sends cookies automatically.
function captureSessionId() {
  // 1. Named cookie (most common in Java/PHP legacy systems)
  const cookieMatch = document.cookie.match(
    /(?:^|;\s*)(?:sessionid|JSESSIONID|PHPSESSID|session_id|SID|sid)=([^;]+)/i
  );
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);

  // 2. Window-level variable set by the host page
  for (const key of ['sessionId', 'session_id', 'SESSION_ID', 'sessionID', 'SID']) {
    if (typeof window[key] === 'string' && window[key]) return window[key];
  }

  // 3. sessionStorage
  for (const key of ['sessionid', 'sessionId', 'session_id', 'sid', 'SID']) {
    const v = sessionStorage.getItem(key);
    if (v) return v;
  }

  // 4. Hidden input field with session-related name
  const hiddenInput = document.querySelector(
    'input[type="hidden"][name*="session" i], input[type="hidden"][name*="sid" i]'
  );
  if (hiddenInput?.value) return hiddenInput.value;

  return null;
}

// ── HTTP ───────────────────────────────────────────────────────────────────────
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

// ── HTML parsing ───────────────────────────────────────────────────────────────
function extractOnclickArgs(onclickAttr) {
  if (!onclickAttr) return null;
  const m = onclickAttr.match(/\w+\s*\(([^)]*)\)/);
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, ''));
}

function parseTableRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows = [];

  doc.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td'));
    if (cells.length === 0) return; // skip header-only rows

    const onclick = {};
    [tr, ...cells].forEach(node => {
      const oc = node.getAttribute('onclick');
      if (!oc) return;
      const fnName = oc.match(/^([a-zA-Z_]\w*)\s*\(/)?.[1];
      if (fnName) onclick[fnName] = extractOnclickArgs(oc);
    });

    rows.push({
      cells: cells.map(td => td.textContent.trim()),
      onclick,
    });
  });

  return rows;
}

// Conservative positional mapping — indexes calibrated after seeing real HTML.
// _rawCells included in every item so the export reveals the actual structure.
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

// ── Message listener ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== 'WTTRX_FETCH') return false;

  (async () => {
    try {
      const sessionId = captureSessionId();

      const [studiesHtml, unrecHtml] = await Promise.all([
        postAction('findStudies',    sessionId),
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

  return true; // keep channel open for async response
});
