'use strict';

const $ = id => document.getElementById(id);

const el = {
  sessionDot:   $('js-session-dot'),
  sessionLabel: $('js-session-label'),
  btnFetch:     $('js-btn-fetch'),
  content:      $('js-content'),
  btnExport:    $('js-btn-export'),
};

let lastData = null;

// ── Messaging ──────────────────────────────────────────────────────────────────
async function fetchFromContentScript() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { action: 'WTTRX_FETCH' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(
          'Content script não está disponível nesta página. ' +
          'Recarregue a página do sistema de radiologia e tente novamente.'
        ));
        return;
      }
      resolve(response);
    });
  });
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function setSessionStatus(captured) {
  el.sessionDot.className = 'status-dot ' + (captured ? 'is-ok' : 'is-warn');
  el.sessionLabel.textContent = captured
    ? 'Sessão capturada'
    : 'Sessão não detectada — cookies enviados automaticamente';
}

function showError(msg) {
  el.content.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'error-state';
  div.textContent = msg;
  el.content.appendChild(div);
  el.sessionDot.className = 'status-dot is-error';
  el.sessionLabel.textContent = 'Erro na comunicação';
}

// ── Exam rendering ─────────────────────────────────────────────────────────────
function makeField(label, value) {
  const row = document.createElement('div');
  row.className = 'exam-field';

  const lbl = document.createElement('span');
  lbl.className = 'exam-field__label';
  lbl.textContent = label + ':';

  const val = document.createElement('span');
  val.className = 'exam-field__value';
  val.textContent = value;

  row.appendChild(lbl);
  row.appendChild(val);
  return row;
}

function makeFnTag(fnName, args) {
  if (!args) return null;
  const tag = document.createElement('div');
  tag.className = 'fn-tag';
  tag.textContent = `${fnName}(${args.join(', ')})`;
  return tag;
}

function renderStudy(study) {
  const card = document.createElement('div');
  card.className = 'exam-card';

  const fields = [
    ['Paciente',    study.patientName],
    ['ID',          study.patientId],
    ['Estudo',      study.studyId],
    ['Modalidade',  study.modality],
    ['Descrição',   study.studyDescription],
    ['Nº Acesso',   study.accessionNumber],
    ['Status',      study.status],
  ];

  fields.forEach(([label, value]) => {
    if (value) card.appendChild(makeField(label, value));
  });

  const gsp = makeFnTag('getStdPrints', study.getStdPrints);
  const asc = makeFnTag('associate',    study.associate);
  if (gsp) card.appendChild(gsp);
  if (asc) card.appendChild(asc);

  if (!fields.some(([, v]) => v) && !gsp && !asc) {
    const raw = document.createElement('div');
    raw.className = 'fn-tag fn-tag--raw';
    raw.textContent = study._rawCells.join(' | ');
    card.appendChild(raw);
  }

  return card;
}

function renderUnrec(item, idx) {
  const card = document.createElement('div');
  card.className = 'exam-card exam-card--unrec';

  const index = document.createElement('div');
  index.className = 'exam-index';
  index.textContent = `#${idx + 1}`;
  card.appendChild(index);

  item.cells.forEach((cell, i) => {
    if (cell) card.appendChild(makeField(`[${i}]`, cell));
  });

  const gsp = makeFnTag('getStdPrints', item.getStdPrints);
  const asc = makeFnTag('associate',    item.associate);
  if (gsp) card.appendChild(gsp);
  if (asc) card.appendChild(asc);

  return card;
}

function renderSection(title, items, renderFn) {
  const section = document.createElement('section');
  section.className = 'section';

  const heading = document.createElement('h2');
  heading.className = 'section__title';
  heading.textContent = `${title} (${items.length})`;
  section.appendChild(heading);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum item encontrado.';
    section.appendChild(empty);
  } else {
    items.forEach((item, idx) => section.appendChild(renderFn(item, idx)));
  }

  return section;
}

function render(data) {
  el.content.innerHTML = '';

  const ts = document.createElement('p');
  ts.className = 'fetch-time';
  ts.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
  el.content.appendChild(ts);

  el.content.appendChild(renderSection('Exames reconhecidos',     data.studies,     renderStudy));
  el.content.appendChild(renderSection('Exames não reconhecidos', data.unrecPrints, renderUnrec));
}

// ── Actions ────────────────────────────────────────────────────────────────────
async function handleFetch() {
  el.btnFetch.disabled = true;
  el.btnFetch.textContent = 'Buscando…';

  el.content.innerHTML = '';
  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.textContent = 'Consultando o servidor…';
  el.content.appendChild(loading);

  try {
    const data = await fetchFromContentScript();
    if (!data?.ok) throw new Error(data?.error ?? 'Resposta inválida do servidor.');

    setSessionStatus(data.sessionCaptured);
    lastData = data;
    render(data);
    el.btnExport.disabled = false;
  } catch (err) {
    showError(err.message);
  } finally {
    el.btnFetch.disabled = false;
    el.btnFetch.textContent = 'Buscar';
  }
}

function handleExport() {
  if (!lastData) return;

  const payload = {
    exportedAt:      new Date().toISOString(),
    sessionCaptured: lastData.sessionCaptured,
    studies:         lastData.studies,
    unrecPrints:     lastData.unrecPrints,
    _rawStudiesHtml: lastData._rawStudiesHtml,
    _rawUnrecHtml:   lastData._rawUnrecHtml,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `wttrx-exames-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

el.btnFetch.addEventListener('click', handleFetch);
el.btnExport.addEventListener('click', handleExport);
