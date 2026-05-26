'use strict';

(function attachQueue() {
  const { WTTRX } = globalThis;

  let _items      = [];
  let _processing = false;
  let _paused     = false;
  const _handlers  = new Map();
  const _executors = new Map();

  function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function _generateId() {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function _emit(event, data) {
    const fns = _handlers.get(event) || [];
    for (const fn of fns) {
      try { fn(data); } catch (e) {
        WTTRX.Logger.warn('content', `Erro em handler do evento ${event}: ${e.message}`);
      }
    }
  }

  function on(event, handler) {
    if (!_handlers.has(event)) _handlers.set(event, []);
    _handlers.get(event).push(handler);
  }

  function registerExecutor(type, fn) {
    _executors.set(type, fn);
    WTTRX.Logger.log('content', `Queue: executor registrado para tipo "${type}"`);
  }

  function enqueue(type, payload = {}) {
    const item = { id: _generateId(), type, payload, addedAt: Date.now() };
    _items.push(item);
    WTTRX.Logger.log('content', `Queue: item enfileirado "${type}" (tamanho: ${_items.length})`);
    _emit(WTTRX.QUEUE_EVENTS.ITEM_ADDED, { item, queueSize: _items.length });

    if (!_processing && !_paused) {
      _processNext();
    }
  }

  function pause() {
    _paused = true;
    WTTRX.Logger.log('content', 'Queue: pausada');
  }

  function resume() {
    _paused = false;
    WTTRX.Logger.log('content', 'Queue: retomada');
    if (!_processing) _processNext();
  }

  function clear() {
    _items = [];
    _processing = false;
    WTTRX.Logger.log('content', 'Queue: limpa');
  }

  function size() {
    return _items.length;
  }

  async function _processNext() {
    if (_paused || _items.length === 0) {
      _processing = false;
      if (_items.length === 0) {
        _emit(WTTRX.QUEUE_EVENTS.QUEUE_EMPTY, {});
      }
      return;
    }

    _processing = true;
    const item = _items.shift();

    try {
      await WTTRX.Retry.withRetry(
        () => _executeItem(item),
        { label: `queue:${item.type}`, context: 'content' }
      );
      _emit(WTTRX.QUEUE_EVENTS.ITEM_PROCESSED, { item });
    } catch (e) {
      WTTRX.Logger.error('content', `Queue: item "${item.type}" falhou definitivamente: ${e.message}`);
      _emit(WTTRX.QUEUE_EVENTS.ITEM_FAILED, { item, error: e.message });
    }

    const delay = WTTRX.Config.get('actionDelayMs') ?? 800;
    await _sleep(delay);
    _processNext();
  }

  async function _executeItem(item) {
    const executor = _executors.get(item.type);
    if (!executor) {
      throw new Error(`Queue: nenhum executor registrado para tipo "${item.type}"`);
    }
    return executor(item.payload);
  }

  WTTRX.Queue = Object.freeze({ enqueue, pause, resume, clear, size, on, registerExecutor });
})();
