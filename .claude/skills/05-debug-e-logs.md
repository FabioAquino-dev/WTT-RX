# Skill 05 — Debug e Logs

## Prefixo padrão

Todos os logs da extensão devem usar o prefixo `[WTT-RX]` seguido do contexto:

```js
console.log('[WTT-RX][popup] Extensão iniciada');
console.warn('[WTT-RX][content] Elemento não encontrado: #form-login');
console.error('[WTT-RX][background] Falha ao enviar mensagem:', error.message);
```

Contextos válidos: `popup`, `content`, `background`, `options`.

## Níveis de log

| Nível | Quando usar |
|---|---|
| `console.log` | Fluxo normal, eventos esperados (apenas em dev) |
| `console.warn` | Situação inesperada mas recuperável |
| `console.error` | Falha que impede uma funcionalidade |

## Logs em produção

- Remover ou desativar `console.log` de fluxo normal antes de considerar uma versão estável.
- Manter `console.warn` e `console.error` sempre — ajudam no diagnóstico em campo.
- Usar uma flag de debug global se necessário:

```js
const DEBUG = false; // ligar apenas durante desenvolvimento
if (DEBUG) console.log('[WTT-RX][popup] estado atual:', state);
```

## Inspecionando a extensão

- **Popup**: clicar com botão direito no popup > Inspecionar
- **Content script**: DevTools da aba onde está injetado (Console mostra logs do content script)
- **Background/Service Worker**: `chrome://extensions` > detalhes da extensão > "Service Worker" > Inspecionar

## Diagnóstico de mensagens entre contextos

Ao depurar comunicação entre contextos, logar nos dois lados:

```js
// Quem envia
console.log('[WTT-RX][popup] Enviando mensagem:', { action: 'lerPagina' });
chrome.runtime.sendMessage({ action: 'lerPagina' });

// Quem recebe
chrome.runtime.onMessage.addListener((msg, sender) => {
  console.log('[WTT-RX][background] Mensagem recebida:', msg, 'de:', sender.tab?.id);
});
```

## Erros comuns e como identificar

| Sintoma | Causa provável |
|---|---|
| Content script não executa | Permissão de host incorreta ou `matches` errado no manifest |
| `chrome.runtime.lastError` | Mensagem enviada sem listener ativo |
| Service worker encerrado | Variável de estado em memória perdida — usar storage |
| Popup abre em branco | Erro de JavaScript no popup.js — verificar Console do popup |

## Storage de diagnóstico

Em casos difíceis, salvar estado para inspeção:

```js
chrome.storage.local.set({ '_debug_last_error': { msg: error.message, ts: Date.now() } });
```

Limpar após diagnóstico concluído.
