'use strict';

// Executes arbitrary JS in the MAIN world of the target tab.
// Called by content.js via chrome.runtime.sendMessage({ action: 'EXEC_IN_PAGE', code }).
// Using chrome.scripting.executeScript (world: MAIN) avoids CSP violations from inline
// script injection.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'EXEC_IN_PAGE') return false;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false, error: 'no tabId' });
    return false;
  }

  chrome.scripting.executeScript({
    target: { tabId },
    world:  'MAIN',
    func:   code => { try { eval(code); } catch (_) {} },
    args:   [msg.code],
  })
    .then(()    => sendResponse({ ok: true }))
    .catch(err  => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open for async sendResponse
});
