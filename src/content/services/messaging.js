'use strict';

(function attachMessagingService() {
  const { WTTRX } = globalThis;

  // Sends a message to the background service worker.
  function send(action, payload = {}) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action, payload }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Registers a handler for messages sent from background/popup to this content script.
  // handler(message, sender) may return a value or a Promise.
  function onMessage(handler) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message?.action) return false;

      // Only accept messages from our own extension
      if (sender.id !== chrome.runtime.id && !sender.tab) {
        WTTRX.Logger.warn('content', 'Mensagem de origem desconhecida ignorada', sender.id);
        return false;
      }

      const result = handler(message, sender);

      if (result instanceof Promise) {
        result
          .then(sendResponse)
          .catch((e) => {
            WTTRX.Logger.error('content', 'Erro no handler de mensagem:', e.message);
            sendResponse({ error: e.message });
          });
        return true; // keep channel open for async response
      }

      sendResponse(result);
      return false;
    });
  }

  WTTRX.MessagingService = Object.freeze({ send, onMessage });
})();
