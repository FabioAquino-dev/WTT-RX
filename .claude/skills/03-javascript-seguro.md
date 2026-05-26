# Skill 03 — JavaScript Seguro

## Regras gerais

- Usar `'use strict'` em todos os arquivos de script (exceto módulos ES, onde é implícito).
- Preferir `const` > `let`. Nunca usar `var`.
- Funções pequenas com responsabilidade única.
- Nomear variáveis e funções de forma descritiva — sem abreviações obscuras.

## Prevenção de XSS

- **Nunca** usar `innerHTML` com dados dinâmicos.
- Preferir `textContent` para inserir texto.
- Para construção de HTML dinâmico, usar `createElement` + `setAttribute`.
- Se innerHTML for inevitável, sanitizar com `DOMPurify` ou equivalente.

```js
// Errado
element.innerHTML = userInput;

// Correto
element.textContent = userInput;

// Correto para HTML controlado
const el = document.createElement('div');
el.textContent = userInput;
container.appendChild(el);
```

## Prevenção de injeção de código

- Nunca usar `eval()`, `new Function()`, `setTimeout(string)` ou `setInterval(string)`.
- Nunca executar strings recebidas via mensagem como código.

## Tratamento de erros

- Usar `try/catch` em toda operação assíncrona.
- Logar erros com contexto suficiente para diagnóstico (ver skill 05).
- Nunca silenciar erros com catch vazio.

```js
// Errado
try { await riskyOp(); } catch (e) {}

// Correto
try {
  await riskyOp();
} catch (e) {
  console.error('[WTT-RX] riskyOp falhou:', e.message);
}
```

## Comunicação segura entre extensão e página

- Validar a origem (`sender.origin`, `sender.id`) em listeners de mensagem.
- Nunca confiar em dados vindos da página hospedeira sem validação.
- Usar `chrome.runtime.id` para verificar que mensagens vêm da própria extensão.

## Dados sensíveis

- Não logar dados sensíveis (senhas, tokens, CPF, etc.).
- Não armazenar dados sensíveis em `chrome.storage` sem necessidade clara.
- Se precisar armazenar algo sensível, documentar o motivo explicitamente no código.

## Async/Await

- Sempre `await` Promises — nunca deixar Promises flutuando sem tratamento.
- Funções assíncronas devem ter retorno explícito ou ser `void` documentadas.
