'use strict';

(function attachPatientMatcher() {
  const { WTTRX } = globalThis;

  /**
   * Finds the matching patient row in the lower list.
   *
   * Strategy (priority order):
   *   1. prontuario (most reliable — unique identifier)
   *   2. accessNumber
   *   3. patientName (fuzzy, last resort)
   *
   * Returns the matching DOM element or null.
   */
  function findMatch(examData, listSelector) {
    if (!examData) {
      WTTRX.Logger.warn('content', 'PatientMatcher: dados do exame ausentes');
      return null;
    }

    const list = document.querySelector(listSelector);
    if (!list) {
      WTTRX.Logger.warn('content', `PatientMatcher: lista não encontrada: "${listSelector}"`);
      return null;
    }

    try {
      const match =
        _matchByProntuario(list, examData.prontuario) ??
        _matchByAccessNumber(list, examData.accessNumber) ??
        _matchByName(list, examData.patientName);

      if (match) {
        WTTRX.Logger.log('content', 'PatientMatcher: correspondência encontrada para', examData.patientName);
      } else {
        WTTRX.Logger.warn('content', 'PatientMatcher: sem correspondência para', examData.patientName);
      }

      return match;
    } catch (e) {
      WTTRX.Logger.error('content', 'PatientMatcher: erro durante matching:', e.message);
      return null;
    }
  }

  // TODO: replace selectors after DOM inspection
  function _matchByProntuario(list, prontuario) {
    if (!prontuario) return null;
    // const rows = list.querySelectorAll('.patient-row');
    // return Array.from(rows).find(r => r.querySelector('.prontuario-cell')?.textContent.trim() === prontuario) ?? null;
    return null;
  }

  function _matchByAccessNumber(list, accessNumber) {
    if (!accessNumber) return null;
    return null;
  }

  function _matchByName(list, name) {
    if (!name) return null;
    return null;
  }

  WTTRX.PatientMatcher = Object.freeze({ findMatch });
})();
