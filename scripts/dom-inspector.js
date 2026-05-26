/**
 * WTT-RX DOM Inspector
 *
 * Cole este script inteiro no Console do DevTools (F12 → Console) na página do sistema legado.
 * Um painel flutuante aparecerá no canto superior direito.
 *
 * USO:
 *   1. Cole e pressione Enter
 *   2. Passe o mouse pelos elementos da página — o painel mostra seletores em tempo real
 *   3. Clique em qualquer elemento para FIXAR as informações no painel
 *   4. Clique em "Copiar" para copiar o seletor
 *   5. Use as abas para organizar os seletores coletados por categoria
 *   6. Clique em "Exportar" ao final para gerar o conteúdo de SELECTORS.md
 *   7. Para encerrar: wttrxInspector.destroy()
 */
(function launchWttrxInspector() {
  'use strict';

  if (window.__wttrxInspector) {
    console.warn('[WTT-RX Inspector] Já está ativo. Use wttrxInspector.destroy() para reiniciar.');
    return;
  }

  // ── Categorias de seletores a coletar ───────────────────────────────────
  const CATEGORIES = [
    { key: 'pending_list_container',  label: 'Lista sup: container' },
    { key: 'pending_list_item',       label: 'Lista sup: item/linha' },
    { key: 'pending_item_red',        label: 'Lista sup: item VERMELHO (?)' },
    { key: 'pending_item_loading',    label: 'Lista sup: item CARREGANDO (spinner)' },
    { key: 'pending_item_yellow',     label: 'Lista sup: item AMARELO' },
    { key: 'pending_item_id',         label: 'Lista sup: identificador do exame' },
    { key: 'patient_list_container',  label: 'Lista inf: container' },
    { key: 'patient_list_row',        label: 'Lista inf: linha de paciente' },
    { key: 'patient_prontuario',      label: 'Lista inf: campo prontuário' },
    { key: 'patient_name',            label: 'Lista inf: campo nome' },
    { key: 'patient_access_number',   label: 'Lista inf: nº de acesso' },
    { key: 'patient_yellow_folder',   label: 'Lista inf: pasta amarela (ação)' },
    { key: 'exam_panel_container',    label: 'Painel exame: container' },
    { key: 'exam_panel_name',         label: 'Painel exame: nome paciente' },
    { key: 'exam_panel_prontuario',   label: 'Painel exame: prontuário' },
    { key: 'exam_panel_access',       label: 'Painel exame: nº acesso' },
    { key: 'exam_confirm_button',     label: 'Painel exame: botão confirmar' },
    { key: 'exam_success_indicator',  label: 'Painel exame: indicador de sucesso' },
    { key: 'loading_indicator',       label: 'Página: indicador de carregamento' },
  ];

  const collected = {};

  // ── Gerador de seletor estável ───────────────────────────────────────────
  function buildSelector(el) {
    if (!el || el === document.body) return 'body';

    // 1. ID único
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
      return `#${CSS.escape(el.id)}`;
    }

    // 2. data-* únicos
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        const sel = `${el.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }

    // 3. tag + classes estáveis
    const stableClasses = Array.from(el.classList)
      .filter(c => !/^\d/.test(c) && c.length > 2 && !c.includes('active') && !c.includes('hover') && !c.includes('selected'));

    if (stableClasses.length > 0) {
      const sel = `${el.tagName.toLowerCase()}.${stableClasses.slice(0, 3).map(CSS.escape).join('.')}`;
      if (document.querySelectorAll(sel).length <= 5) return sel;
    }

    // 4. Caminho curto pelo ancestral mais próximo com ID
    const path = _buildPath(el);
    return path;
  }

  function _buildPath(el) {
    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const tag   = current.tagName.toLowerCase();
      const cls   = Array.from(current.classList).slice(0, 2).map(CSS.escape).join('.');
      const piece = cls ? `${tag}.${cls}` : tag;

      // nth-child apenas se necessário
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(`${piece}:nth-of-type(${idx})`);
      } else {
        parts.unshift(piece);
      }

      current = current.parentElement;
      depth++;
    }

    return parts.join(' > ');
  }

  function describeElement(el) {
    const tag     = el.tagName.toLowerCase();
    const id      = el.id ? `#${el.id}` : '';
    const classes = Array.from(el.classList).join(' ');
    const text    = el.textContent?.trim().slice(0, 60).replace(/\s+/g, ' ') || '';
    const dataAttrs = Array.from(el.attributes)
      .filter(a => a.name.startsWith('data-'))
      .map(a => `${a.name}="${a.value}"`)
      .join(' ');
    return { tag, id, classes, text, dataAttrs, selector: buildSelector(el) };
  }

  // ── Shadow DOM do painel ─────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id    = '__wttrx-inspector-host';
  host.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;width:0;height:0;pointer-events:none;';

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :host { all: initial; }
      #panel {
        position: fixed;
        top: 12px;
        right: 12px;
        width: 360px;
        max-height: 92vh;
        background: #0d1117;
        color: #c9d1d9;
        font-family: 'Cascadia Code', 'Fira Mono', 'Consolas', monospace;
        font-size: 11px;
        border: 1px solid #30363d;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        overflow: hidden;
      }
      #header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: #161b22;
        border-bottom: 1px solid #21262d;
        cursor: move;
        user-select: none;
        flex-shrink: 0;
      }
      #title { font-size: 12px; font-weight: 600; color: #1e9af5; flex: 1; }
      #pin-indicator {
        font-size: 10px;
        color: #f0883e;
        display: none;
      }
      #pin-indicator.active { display: block; }
      #btn-close {
        background: none; border: none; color: #656d76; cursor: pointer;
        font-size: 14px; line-height: 1; padding: 0 2px;
      }
      #btn-close:hover { color: #f85149; }

      #live-section {
        padding: 8px 10px;
        border-bottom: 1px solid #21262d;
        flex-shrink: 0;
        min-height: 100px;
      }
      .section-title {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #484f58;
        margin-bottom: 4px;
      }
      .info-row {
        display: flex;
        gap: 4px;
        margin-bottom: 3px;
        align-items: flex-start;
      }
      .info-key {
        color: #484f58;
        flex-shrink: 0;
        width: 68px;
      }
      .info-val {
        color: #e6edf3;
        word-break: break-all;
        line-height: 1.4;
      }
      .info-val.selector { color: #79c0ff; }
      .info-val.empty    { color: #484f58; font-style: italic; }

      #actions {
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        border-bottom: 1px solid #21262d;
        flex-shrink: 0;
      }
      .btn {
        flex: 1;
        padding: 4px 6px;
        border-radius: 4px;
        border: 1px solid #30363d;
        font-size: 10px;
        font-family: inherit;
        cursor: pointer;
        background: #161b22;
        color: #8b949e;
        transition: background 0.1s;
      }
      .btn:hover  { background: #21262d; color: #c9d1d9; }
      .btn.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }

      #collected-section {
        flex: 1;
        overflow-y: auto;
        padding: 6px 10px 10px;
      }
      .cat-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid #161b22;
      }
      .cat-label {
        flex-shrink: 0;
        width: 150px;
        color: #656d76;
        font-size: 10px;
        line-height: 1.4;
      }
      .cat-sel {
        flex: 1;
        color: #3fb950;
        word-break: break-all;
        line-height: 1.4;
        font-size: 10px;
      }
      .cat-sel.empty { color: #30363d; font-style: italic; }
      .cat-save-btn {
        flex-shrink: 0;
        padding: 2px 5px;
        background: #21262d;
        border: 1px solid #30363d;
        border-radius: 3px;
        color: #8b949e;
        font-size: 9px;
        font-family: inherit;
        cursor: pointer;
      }
      .cat-save-btn:hover { background: #1f6feb; color: #fff; border-color: #1f6feb; }

      #export-section {
        padding: 6px 10px;
        border-top: 1px solid #21262d;
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      #export-section .btn { flex: 1; }
      #status-bar {
        padding: 3px 10px;
        background: #161b22;
        font-size: 10px;
        color: #3fb950;
        min-height: 20px;
        flex-shrink: 0;
      }
    </style>

    <div id="panel">
      <div id="header">
        <span id="title">⚕ WTT-RX Inspector</span>
        <span id="pin-indicator">● FIXADO</span>
        <button id="btn-close" aria-label="Fechar">✕</button>
      </div>

      <div id="live-section">
        <div class="section-title">Elemento sob o cursor</div>
        <div class="info-row"><span class="info-key">tag:</span>      <span class="info-val" id="el-tag">—</span></div>
        <div class="info-row"><span class="info-key">id:</span>       <span class="info-val" id="el-id">—</span></div>
        <div class="info-row"><span class="info-key">classes:</span>  <span class="info-val" id="el-classes">—</span></div>
        <div class="info-row"><span class="info-key">data-*:</span>   <span class="info-val" id="el-data">—</span></div>
        <div class="info-row"><span class="info-key">texto:</span>    <span class="info-val" id="el-text">—</span></div>
        <div class="info-row"><span class="info-key">seletor:</span>  <span class="info-val selector" id="el-selector">—</span></div>
      </div>

      <div id="actions">
        <button class="btn" id="btn-copy">Copiar seletor</button>
        <button class="btn" id="btn-unpin">Desafixar</button>
      </div>

      <div id="collected-section">
        <div class="section-title">Seletores coletados</div>
        <div id="cat-list"></div>
      </div>

      <div id="export-section">
        <button class="btn" id="btn-export-console">Exportar no Console</button>
        <button class="btn" id="btn-export-md">Gerar SELECTORS.md</button>
      </div>

      <div id="status-bar" id="status-bar"></div>
    </div>
  `;

  document.body.appendChild(host);

  // ── Referências internas ────────────────────────────────────────────────
  const panel       = shadow.getElementById('panel');
  const elTag       = shadow.getElementById('el-tag');
  const elId        = shadow.getElementById('el-id');
  const elClasses   = shadow.getElementById('el-classes');
  const elData      = shadow.getElementById('el-data');
  const elText      = shadow.getElementById('el-text');
  const elSelector  = shadow.getElementById('el-selector');
  const pinIndicator= shadow.getElementById('pin-indicator');
  const btnClose    = shadow.getElementById('btn-close');
  const btnCopy     = shadow.getElementById('btn-copy');
  const btnUnpin    = shadow.getElementById('btn-unpin');
  const catList     = shadow.getElementById('cat-list');
  const statusBar   = shadow.getElementById('status-bar');
  const btnExportConsole = shadow.getElementById('btn-export-console');
  const btnExportMd      = shadow.getElementById('btn-export-md');

  let _pinned        = false;
  let _pinnedEl      = null;
  let _currentSel    = '';
  let _highlightEl   = null;
  const HIGHLIGHT_STYLE = 'outline:2px solid #1e9af5 !important;outline-offset:1px !important;';

  // ── Render live info ────────────────────────────────────────────────────
  function renderInfo(info) {
    elTag.textContent      = info.tag || '—';
    elId.textContent       = info.id  || '—';
    elClasses.textContent  = info.classes || '—';
    elData.textContent     = info.dataAttrs || '—';
    elText.textContent     = info.text || '—';
    elSelector.textContent = info.selector || '—';
    _currentSel = info.selector || '';
  }

  // ── Categorias ──────────────────────────────────────────────────────────
  function renderCategories() {
    catList.innerHTML = '';
    for (const cat of CATEGORIES) {
      const sel  = collected[cat.key];
      const div  = document.createElement('div');
      div.className = 'cat-item';

      const label = document.createElement('span');
      label.className = 'cat-label';
      label.textContent = cat.label;

      const selEl = document.createElement('span');
      selEl.className = sel ? 'cat-sel' : 'cat-sel empty';
      selEl.textContent = sel || '(vazio)';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'cat-save-btn';
      saveBtn.textContent = '✓ usar';
      saveBtn.title = `Salvar seletor atual em: ${cat.label}`;
      saveBtn.addEventListener('click', () => {
        if (!_currentSel) { setStatus('Nenhum seletor ativo.'); return; }
        collected[cat.key] = _currentSel;
        renderCategories();
        setStatus(`✓ Salvo em "${cat.label}": ${_currentSel}`);
      });

      div.appendChild(label);
      div.appendChild(selEl);
      div.appendChild(saveBtn);
      catList.appendChild(div);
    }
  }

  renderCategories();

  // ── Status bar ──────────────────────────────────────────────────────────
  let _statusTimer = null;
  function setStatus(msg, duration = 3000) {
    statusBar.textContent = msg;
    clearTimeout(_statusTimer);
    if (duration > 0) _statusTimer = setTimeout(() => { statusBar.textContent = ''; }, duration);
  }

  // ── Highlight ───────────────────────────────────────────────────────────
  function highlight(el) {
    if (_highlightEl && _highlightEl !== el) {
      _highlightEl.style.removeProperty('outline');
      _highlightEl.style.removeProperty('outline-offset');
    }
    if (el) {
      el.style.cssText += HIGHLIGHT_STYLE;
      _highlightEl = el;
    }
  }

  function clearHighlight() {
    if (_highlightEl) {
      _highlightEl.style.removeProperty('outline');
      _highlightEl.style.removeProperty('outline-offset');
      _highlightEl = null;
    }
  }

  // ── Event listeners ─────────────────────────────────────────────────────
  function onMouseOver(e) {
    if (_pinned) return;
    const target = e.target;
    if (host.contains(target)) return;
    highlight(target);
    renderInfo(describeElement(target));
  }

  function onMouseOut(e) {
    if (_pinned) return;
    if (host.contains(e.relatedTarget)) return;
  }

  function onClick(e) {
    const target = e.target;
    if (host.contains(target)) return;
    e.stopPropagation();
    _pinned   = true;
    _pinnedEl = target;
    pinIndicator.classList.add('active');
    renderInfo(describeElement(target));
    setStatus('Elemento fixado. Clique em "✓ usar" para salvar em uma categoria.');
  }

  btnUnpin.addEventListener('click', () => {
    _pinned = false;
    _pinnedEl = null;
    pinIndicator.classList.remove('active');
    clearHighlight();
    setStatus('Desafixado. Passe o mouse para continuar inspecionando.');
  });

  btnCopy.addEventListener('click', () => {
    if (!_currentSel) { setStatus('Nenhum seletor para copiar.'); return; }
    navigator.clipboard.writeText(_currentSel)
      .then(() => setStatus(`✓ Copiado: ${_currentSel}`))
      .catch(() => { prompt('Copie o seletor:', _currentSel); });
  });

  btnClose.addEventListener('click', destroy);

  btnExportConsole.addEventListener('click', () => {
    console.group('[WTT-RX Inspector] Seletores coletados');
    let count = 0;
    for (const cat of CATEGORIES) {
      const sel = collected[cat.key];
      console.log(`%c${cat.label}`, 'color:#656d76', sel ? `%c${sel}` : '%c(vazio)', sel ? 'color:#3fb950' : 'color:#484f58');
      if (sel) count++;
    }
    console.groupEnd();
    setStatus(`${count}/${CATEGORIES.length} seletores exportados no Console.`);
  });

  btnExportMd.addEventListener('click', () => {
    const md = generateMarkdown();
    console.log('%c[WTT-RX Inspector] SELECTORS.md gerado:\n\n' + md, 'color:#79c0ff');
    try {
      navigator.clipboard.writeText(md).then(() => setStatus('✓ SELECTORS.md copiado para a área de transferência!'));
    } catch (_) {
      setStatus('Conteúdo impresso no Console. Copie de lá.');
    }
  });

  // ── Drag para mover o painel ─────────────────────────────────────────────
  const header = shadow.getElementById('header');
  let _drag = null;
  header.addEventListener('mousedown', (e) => {
    const rect = panel.getBoundingClientRect();
    _drag = { startX: e.clientX - rect.left, startY: e.clientY - rect.top };
  });
  document.addEventListener('mousemove', (e) => {
    if (!_drag) return;
    panel.style.right = 'auto';
    panel.style.left  = `${e.clientX - _drag.startX}px`;
    panel.style.top   = `${e.clientY - _drag.startY}px`;
  });
  document.addEventListener('mouseup', () => { _drag = null; });

  // ── Attach page listeners ────────────────────────────────────────────────
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout',  onMouseOut,  true);
  document.addEventListener('click',     onClick,      true);

  // ── Markdown generator ───────────────────────────────────────────────────
  function generateMarkdown() {
    const rows = CATEGORIES.map(cat => {
      const sel = collected[cat.key] || '???';
      return `| ${cat.label} | \`${sel}\` | |`;
    });

    return `# WTT-RX — Mapeamento de Seletores DOM
<!-- Gerado pelo WTT-RX DOM Inspector em ${new Date().toLocaleString('pt-BR')} -->

## Lista superior — exames pendentes

| Elemento | Seletor | Observações |
|---|---|---|
${rows.slice(0, 6).join('\n')}

## Lista inferior — pacientes

| Elemento | Seletor | Observações |
|---|---|---|
${rows.slice(6, 13).join('\n')}

## Painel/modal de exame aberto

| Elemento | Seletor | Observações |
|---|---|---|
${rows.slice(13, 18).join('\n')}

## Sinais de carregamento/transição

| Estado | Seletor | Observações |
|---|---|---|
${rows.slice(18).join('\n')}
`;
  }

  // ── Destroy ──────────────────────────────────────────────────────────────
  function destroy() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout',  onMouseOut,  true);
    document.removeEventListener('click',     onClick,     true);
    clearHighlight();
    host.remove();
    delete window.__wttrxInspector;
    console.log('[WTT-RX Inspector] Encerrado.');
  }

  // ── API pública ──────────────────────────────────────────────────────────
  window.__wttrxInspector = { destroy, collected, generateMarkdown };
  window.wttrxInspector   = window.__wttrxInspector;

  setStatus('Pronto. Passe o mouse sobre os elementos da página.', 0);
  console.log('%c[WTT-RX Inspector] Ativo. Use wttrxInspector.destroy() para encerrar.', 'color:#1e9af5;font-weight:bold');
})();
