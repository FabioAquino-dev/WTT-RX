# Skill 02 — Extensão Chrome (Manifest V3)

## Arquitetura obrigatória (Manifest V3)

- **manifest.json**: ponto de entrada, declara permissões, scripts e recursos.
- **background/service-worker**: lógica assíncrona, comunicação entre abas, sem acesso ao DOM.
- **content scripts**: injetados em páginas específicas, acesso ao DOM, comunicação via `chrome.runtime.sendMessage`.
- **popup**: interface do usuário ativada pelo ícone da extensão.
- **options page** (opcional): configurações persistentes.

## Regras de permissões

- Declarar **somente** as permissões necessárias no `manifest.json`.
- Preferir `activeTab` a `tabs` quando possível.
- Usar `host_permissions` com o menor escopo possível (domínio específico > `*://*/*`).
- Nunca pedir `<all_urls>` sem justificativa documentada no código.

## Comunicação entre contextos

```
popup ──sendMessage──> background (service worker)
content script ──sendMessage──> background
background ──sendMessage──> content script (via tabs.sendMessage)
```

- Sempre tratar o caso de ausência de resposta (`chrome.runtime.lastError`).
- Usar `async/await` com try/catch em todas as chamadas de mensagem.

## Content Scripts

- Um arquivo por domínio/funcionalidade quando possível.
- Nunca poluir o escopo global da página — usar IIFE ou módulos.
- Não modificar variáveis globais da página hospedeira.
- Usar `MutationObserver` com cuidado: sempre desconectar quando não necessário.

## Storage

- Usar `chrome.storage.local` para dados persistentes do usuário.
- Usar `chrome.storage.session` para dados temporários da sessão.
- Nunca usar `localStorage` da página hospedeira para dados da extensão.

## Service Worker (background)

- Service workers são encerrados automaticamente — nunca assumir estado persistente em variáveis.
- Toda lógica que precisa de estado deve usar `chrome.storage` ou `chrome.alarms`.

## Atualizações e recarga

- Durante desenvolvimento, sempre recarregar a extensão após mudanças no `manifest.json` ou `background`.
- Content scripts exigem reload da aba após alteração.
