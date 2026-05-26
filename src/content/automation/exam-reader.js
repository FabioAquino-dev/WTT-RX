'use strict';

(function attachExamReader() {
  const { WTTRX } = globalThis;

  /**
   * Reads exam data from the currently open exam panel/modal.
   *
   * Returns { patientName, prontuario, accessNumber, readAt } or null.
   * All selectors are stubs — fill in from docs/SELECTORS.md after inspection.
   */
  function readCurrentExam() {
    try {
      const patientName  = _readText('[data-field="patient-name"]');
      const prontuario   = _readText('[data-field="prontuario"]');
      const accessNumber = _readText('[data-field="access-number"]');

      if (!patientName && !prontuario && !accessNumber) {
        WTTRX.Logger.warn('content', 'ExamReader: nenhum dado encontrado no painel de exame');
        return null;
      }

      const data = { patientName, prontuario, accessNumber, readAt: Date.now() };
      WTTRX.Logger.log('content', 'ExamReader: dados lidos', data);
      return data;
    } catch (e) {
      WTTRX.Logger.error('content', 'ExamReader: falha ao ler dados:', e.message);
      return null;
    }
  }

  /**
   * Scans the pending list and categorises each item.
   *
   * Returns array of { element, status, identifier }.
   * Selector stub — implement after DOM mapping.
   */
  function scanPendingList(listSelector) {
    const list = document.querySelector(listSelector);
    if (!list) {
      WTTRX.Logger.warn('content', `ExamReader: lista não encontrada: "${listSelector}"`);
      return [];
    }

    const rows = Array.from(list.querySelectorAll('*')); // TODO: refine selector
    const results = [];

    for (const row of rows) {
      const status = _classifyRow(row);
      if (status !== WTTRX.EXAM_STATUS.UNKNOWN) {
        results.push({ element: row, status, identifier: _extractIdentifier(row) });
      }
    }

    WTTRX.Logger.log('content', `ExamReader: ${results.length} itens classificados`);
    return results;
  }

  function _readText(selector) {
    const el = document.querySelector(selector);
    return el?.textContent?.trim() || null;
  }

  // TODO: implement classification logic based on visual indicators
  // (color class, icon class, text content) after DOM inspection
  function _classifyRow(_row) {
    return WTTRX.EXAM_STATUS.UNKNOWN;
  }

  // TODO: extract unique identifier for the exam row after DOM inspection
  function _extractIdentifier(_row) {
    return null;
  }

  WTTRX.ExamReader = Object.freeze({ readCurrentExam, scanPendingList });
})();
