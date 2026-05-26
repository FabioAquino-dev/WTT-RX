'use strict';

(function attachOverlay() {
  const { WTTRX } = globalThis;

  let _host       = null;
  let _shadowRoot = null;

  /**
   * Mounts a Shadow DOM host on document.body.
   * All extension UI elements are rendered inside this shadow root,
   * fully isolated from the legacy system's styles.
   */
  function mount() {
    if (_host) return;

    _host = document.createElement('div');
    _host.id = 'wttrx-overlay-host';
    // The host itself is zero-size; children inside shadow root position themselves fixed
    _host.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      `z-index:${WTTRX.Z_INDEX.OVERLAY_HOST}`,
      'pointer-events:none',
    ].join(';');

    // closed mode: external JS cannot reach the shadow root
    _shadowRoot = _host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      #wttrx-root {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
      }
    `;

    const root = document.createElement('div');
    root.id = 'wttrx-root';

    _shadowRoot.appendChild(style);
    _shadowRoot.appendChild(root);
    document.body.appendChild(_host);

    WTTRX.Logger.log('content', 'Overlay: Shadow DOM montado');
  }

  function unmount() {
    if (_host) {
      _host.remove();
      _host       = null;
      _shadowRoot = null;
    }
    WTTRX.Logger.log('content', 'Overlay: desmontado');
  }

  // Returns the root container inside the shadow DOM.
  // UI components append their elements here.
  function getRoot() {
    return _shadowRoot ? _shadowRoot.getElementById('wttrx-root') : null;
  }

  WTTRX.Overlay = Object.freeze({ mount, unmount, getRoot });
})();
