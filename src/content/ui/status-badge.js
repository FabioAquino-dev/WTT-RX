'use strict';

(function attachStatusBadge() {
  const { WTTRX } = globalThis;

  let _el = null;

  const STATE_COLORS = Object.freeze({
    idle:    '#1a1a2e',
    running: '#0d6e3a',
    paused:  '#7a5c00',
    error:   '#8b1a1a',
  });

  const BASE_STYLE = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'background:#1a1a2e',
    'color:#ffffff',
    'font-size:12px',
    'padding:5px 12px',
    'border-radius:20px',
    `z-index:${WTTRX.Z_INDEX.STATUS_BADGE}`,
    'pointer-events:auto',
    'cursor:default',
    'user-select:none',
    'box-shadow:0 2px 8px rgba(0,0,0,0.45)',
    'transition:background 0.2s ease',
    'line-height:1.4',
  ].join(';');

  function mount() {
    if (_el) return;

    const root = WTTRX.Overlay.getRoot();
    if (!root) {
      WTTRX.Logger.warn('content', 'StatusBadge: Overlay não montado — badge não criado');
      return;
    }

    _el = document.createElement('div');
    _el.id = 'wttrx-status-badge';
    _el.setAttribute('aria-label', 'WTT-RX status da automação');
    _el.setAttribute('role', 'status');
    _el.setAttribute('aria-live', 'polite');
    _el.style.cssText = BASE_STYLE;

    root.style.pointerEvents = 'none';
    _el.style.pointerEvents = 'auto';

    root.appendChild(_el);
    setState('idle', 'WTT-RX: pronto');
  }

  /**
   * Updates badge text and color.
   * state: 'idle' | 'running' | 'paused' | 'error'
   */
  function setState(state, message) {
    if (!_el) return;
    const bg = STATE_COLORS[state] ?? STATE_COLORS.idle;
    _el.style.cssText = BASE_STYLE + `;background:${bg}`;
    _el.textContent = message;
    WTTRX.Logger.log('content', `StatusBadge: ${state} — ${message}`);
  }

  function unmount() {
    if (_el) {
      _el.remove();
      _el = null;
    }
  }

  WTTRX.StatusBadge = Object.freeze({ mount, setState, unmount });
})();
