'use strict';

// Content script entry point.
// All modules are already loaded by the time this file runs (see manifest.json).
(async function init() {
  const LOG  = (m, ...a) => WTTRX.Logger.log('content', m, ...a);
  const WARN = (m, ...a) => WTTRX.Logger.warn('content', m, ...a);
  const ERR  = (m, ...a) => WTTRX.Logger.error('content', m, ...a);

  LOG(`WTT-RX v${WTTRX.VERSION} inicializando...`);

  // 1. Load persisted config (may update WTTRX.DEBUG)
  await WTTRX.Config.load();

  // 2. Mount visual layer into Shadow DOM
  WTTRX.Overlay.mount();
  WTTRX.StatusBadge.mount();
  WTTRX.StatusBadge.setState('idle', 'WTT-RX: pronto');

  // 3. Register queue executors
  WTTRX.Queue.registerExecutor(
    WTTRX.QUEUE_ITEM_TYPES.ASSOCIATE_EXAM,
    async (payload) => {
      // Placeholder — will call ExamAssociator.associate() after DOM mapping
      WARN('executor ASSOCIATE_EXAM ainda não implementado', payload);
    }
  );

  WTTRX.Queue.registerExecutor(
    WTTRX.QUEUE_ITEM_TYPES.RELEASE_YELLOW,
    async (payload) => {
      WARN('executor RELEASE_YELLOW ainda não implementado', payload);
    }
  );

  // 4. Queue event listeners → update UI
  WTTRX.Queue.on(WTTRX.QUEUE_EVENTS.QUEUE_EMPTY, () => {
    WTTRX.StatusBadge.setState('idle', 'WTT-RX: fila vazia');
    LOG('Fila de processamento vazia');
  });

  WTTRX.Queue.on(WTTRX.QUEUE_EVENTS.ITEM_FAILED, ({ item, error }) => {
    WTTRX.StatusBadge.setState('error', `WTT-RX: erro em ${item.type}`);
    ERR(`Item da fila falhou — tipo: ${item.type}`, error);
  });

  WTTRX.Queue.on(WTTRX.QUEUE_EVENTS.ITEM_PROCESSED, ({ item }) => {
    LOG(`Item processado: ${item.type}`);
  });

  // 5. Listen for commands from popup/background
  WTTRX.MessagingService.onMessage((message) => {
    LOG(`Mensagem recebida: ${message.action}`);
    return _handleAction(message);
  });

  LOG('WTT-RX: inicialização concluída');

  // ─────────────────────────────────────────────
  // Action dispatcher
  // ─────────────────────────────────────────────
  function _handleAction(message) {
    switch (message.action) {
      case WTTRX.ACTIONS.GET_STATUS:
        return {
          state: WTTRX.STATES.IDLE,
          queueSize: WTTRX.Queue.size(),
          version: WTTRX.VERSION,
        };

      case WTTRX.ACTIONS.START_AUTOMATION:
        WTTRX.StatusBadge.setState('running', 'WTT-RX: executando...');
        WTTRX.Queue.resume();
        // TODO: trigger ExamReader.scanPendingList() after DOM selectors are mapped
        return { started: true };

      case WTTRX.ACTIONS.STOP_AUTOMATION:
        WTTRX.Queue.pause();
        WTTRX.StatusBadge.setState('paused', 'WTT-RX: pausado');
        return { stopped: true };

      default:
        WARN(`Ação desconhecida: ${message.action}`);
        return { error: `Ação desconhecida: ${message.action}` };
    }
  }
})();
