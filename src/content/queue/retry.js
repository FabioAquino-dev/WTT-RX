'use strict';

(function attachRetry() {
  const { WTTRX } = globalThis;

  function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Executes fn() up to maxAttempts times.
   * Uses linear backoff: delay * attempt number.
   * Throws the last error if all attempts fail.
   *
   * options:
   *   maxAttempts  — default from Config.retryMaxAttempts
   *   delayMs      — default from Config.retryDelayMs
   *   context      — log context string
   *   label        — human label for log messages
   */
  async function withRetry(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? WTTRX.Config.get('retryMaxAttempts') ?? 3;
    const delayMs     = options.delayMs     ?? WTTRX.Config.get('retryDelayMs')     ?? 1500;
    const context     = options.context     ?? 'content';
    const label       = options.label       ?? 'operação';

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        if (attempt > 1) {
          WTTRX.Logger.log(context, `${label} bem-sucedida na tentativa ${attempt}/${maxAttempts}`);
        }
        return result;
      } catch (e) {
        lastError = e;
        WTTRX.Logger.warn(context, `${label} falhou (tentativa ${attempt}/${maxAttempts}): ${e.message}`);

        if (attempt < maxAttempts) {
          await _sleep(delayMs * attempt);
        }
      }
    }

    WTTRX.Logger.error(context, `${label} esgotou ${maxAttempts} tentativas. Último erro: ${lastError.message}`);
    throw lastError;
  }

  WTTRX.Retry = Object.freeze({ withRetry });
})();
