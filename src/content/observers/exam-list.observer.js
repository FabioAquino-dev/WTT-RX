'use strict';

(function attachExamListObserver() {
  const { WTTRX } = globalThis;

  let _observer = null;
  let _target   = null;
  let _callback = null;

  /**
   * Watches the pending exam list container for new items.
   *
   * targetSelector — CSS selector for the list container.
   *   Replace with the actual selector after DOM inspection.
   *
   * callback(examElements[]) fires when new red/pending items appear.
   */
  function start(targetSelector, callback) {
    const target = document.querySelector(targetSelector);

    if (!target) {
      WTTRX.Logger.warn('content', `ExamListObserver: container não encontrado: "${targetSelector}"`);
      return false;
    }

    _target   = target;
    _callback = callback;

    _observer = new MutationObserver(_onMutation);
    _observer.observe(_target, {
      childList: true,
      subtree: true,
    });

    WTTRX.Logger.log('content', `ExamListObserver: observando "${targetSelector}"`);
    return true;
  }

  function stop() {
    if (_observer) {
      _observer.disconnect();
      _observer = null;
      _target   = null;
    }
    WTTRX.Logger.log('content', 'ExamListObserver: parado');
  }

  function _onMutation(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;

      const pending = _extractPendingExams(mutation.addedNodes);
      if (pending.length > 0 && _callback) {
        WTTRX.Logger.log('content', `ExamListObserver: ${pending.length} novo(s) exame(s) pendente(s)`);
        _callback(pending);
      }
    }
  }

  /**
   * Identifies red items with "?" from a NodeList.
   *
   * Implementation stub — selectors will be filled in after DOM mapping.
   * See docs/SELECTORS.md for the inspection checklist.
   */
  function _extractPendingExams(nodes) {
    const results = [];
    for (const node of nodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      // TODO: replace with real selectors after DOM inspection
      // Expected shape: { element, identifier }
      // const isPendingRed = node.classList.contains('???') && node.querySelector('.icon-question');
      // if (isPendingRed) results.push({ element: node, identifier: node.dataset.id ?? null });
    }
    return results;
  }

  WTTRX.ExamListObserver = Object.freeze({ start, stop });
})();
