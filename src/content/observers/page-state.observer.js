'use strict';

(function attachPageStateObserver() {
  const { WTTRX } = globalThis;

  let _observer     = null;
  let _debounceTimer = null;
  let _callback     = null;

  /**
   * Starts observing the entire body for DOM changes.
   * callback(mutations[]) fires after the debounce window.
   *
   * Used to detect page transitions in the legacy system
   * (e.g., a modal opening, a table reloading).
   */
  function start(callback) {
    if (_observer) {
      WTTRX.Logger.warn('content', 'PageStateObserver: já está ativo — ignorando start()');
      return;
    }

    _callback = callback;

    _observer = new MutationObserver(_onMutation);
    _observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // Only watch class/style/data attributes to reduce noise
      attributeFilter: ['class', 'style', 'disabled', 'data-status', 'data-state'],
    });

    WTTRX.Logger.log('content', 'PageStateObserver: iniciado');
  }

  function stop() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
    }
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _callback = null;
    WTTRX.Logger.log('content', 'PageStateObserver: parado');
  }

  function _onMutation(mutations) {
    clearTimeout(_debounceTimer);
    const debounce = WTTRX.Config.get('observerDebounceMs') ?? 500;

    _debounceTimer = setTimeout(() => {
      const relevant = mutations.filter(_isRelevant);
      if (relevant.length > 0 && _callback) {
        WTTRX.Logger.log('content', `PageStateObserver: ${relevant.length} mutação(ões) relevante(s)`);
        _callback(relevant);
      }
    }, debounce);
  }

  // Refined once the actual DOM structure of the legacy system is mapped.
  // For now, all mutations pass — will add filtering after the DOM inspection phase.
  function _isRelevant(_mutation) {
    return true;
  }

  WTTRX.PageStateObserver = Object.freeze({ start, stop });
})();
