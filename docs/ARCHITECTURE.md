# WTT-RX — Arquitetura

## Visão geral

WTT-RX é uma extensão Chrome (Manifest V3) que automatiza o fluxo de associação e liberação de exames em um sistema legado de radiologia.

```
┌─────────────────────────────────────────────────┐
│                   POPUP                         │
│  popup.html / popup.js / popup.css              │
│  · Controles start/stop                         │
│  · Estatísticas de sessão                       │
│  · Log de atividade recente                     │
└───────────────────┬─────────────────────────────┘
                    │ chrome.runtime.sendMessage
                    ▼
┌─────────────────────────────────────────────────┐
│             BACKGROUND (Service Worker)         │
│  src/background/service-worker.js               │
│  · Roteamento de mensagens                      │
│  · Persistência de config                       │
│  · Forwarding popup → content script            │
└───────────────────┬─────────────────────────────┘
                    │ chrome.tabs.sendMessage
                    ▼
┌─────────────────────────────────────────────────┐
│             CONTENT SCRIPTS (página alvo)       │
│                                                 │
│  core/                                          │
│    constants.js  ← namespace WTTRX, constantes  │
│    logger.js     ← logs estruturados            │
│    config.js     ← configuração persistida      │
│                                                 │
│  services/                                      │
│    storage.js    ← abstração chrome.storage     │
│    messaging.js  ← abstração sendMessage        │
│                                                 │
│  queue/                                         │
│    retry.js      ← backoff linear, tolerância   │
│    queue.js      ← fila de processamento async  │
│                                                 │
│  observers/                                     │
│    page-state.observer.js  ← MutationObserver   │
│    exam-list.observer.js   ← lista de exames    │
│                                                 │
│  automation/  (stubs — aguardam DOM mapping)    │
│    exam-reader.js      ← lê dados do DOM        │
│    patient-matcher.js  ← busca paciente         │
│    exam-associator.js  ← executa associação     │
│                                                 │
│  ui/                                            │
│    overlay.js      ← Shadow DOM host            │
│    status-badge.js ← badge de status na página  │
│                                                 │
│  index.js  ← entry point, conecta tudo         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  OPTIONS PAGE                                   │
│  src/options/options.html|css|js                │
│  · Configurações de comportamento               │
│  · Persiste em chrome.storage.local             │
└─────────────────────────────────────────────────┘
```

## Padrão de namespace dos content scripts

Os content scripts não suportam ES modules nativamente sem um bundler. A solução adotada é um **namespace global isolado**:

```js
// constants.js (primeiro arquivo carregado)
globalThis.WTTRX = globalThis.WTTRX || {};

// Cada módulo subsequente adiciona sua interface:
WTTRX.Logger = Object.freeze({ log, warn, error });
WTTRX.Queue  = Object.freeze({ enqueue, pause, ... });
```

O namespace `WTTRX` vive no **isolated world** dos content scripts — não é acessível à página hospedeira.

## Fluxo de carregamento dos content scripts

O manifest carrega os arquivos em ordem de dependência:

```
1. constants.js     ← sem dependências
2. logger.js        ← depende de: WTTRX (namespace)
3. storage.js       ← depende de: -
4. messaging.js     ← depende de: Logger
5. config.js        ← depende de: Logger, StorageService
6. retry.js         ← depende de: Logger, Config
7. queue.js         ← depende de: Logger, Config, Retry
8. observers/*      ← dependem de: Logger, Config
9. automation/*     ← dependem de: Logger, Config
10. ui/*            ← dependem de: Logger, WTTRX.Z_INDEX
11. index.js        ← depende de: tudo acima
```

## Fluxo de automação (quando implementado)

```
ExamListObserver
    │ detecta item vermelho com "?"
    ▼
Queue.enqueue(ASSOCIATE_EXAM, { examElement })
    │
    ▼
Queue._processNext()
    │
    ├─→ ExamReader.readCurrentExam()
    │       lê: nome, prontuário, número de acesso
    │
    ├─→ PatientMatcher.findMatch(examData, lowerListSelector)
    │       estratégia: prontuário > accessNumber > nome
    │
    └─→ ExamAssociator.associate(matchedElement)
            clica na pasta amarela correta
            aguarda confirmação
            verifica estado de sucesso
```

Se não houver mais vermelhos → liberar amarelos via `RELEASE_YELLOW`.

## Isolamento de UI

Todos os elementos visuais injetados na página legada usam **Shadow DOM** com `mode: 'closed'`. Isso garante:
- Estilos da extensão não vazam para a página
- Estilos da página não afetam a extensão
- Nenhum conflito de z-index ou class names

Classes CSS prefixadas com `wttrx-`. Z-indexes registrados em `WTTRX.Z_INDEX`.

## Tolerância a falhas

```
Queue item
    │
    └─→ Retry.withRetry(fn, { maxAttempts, delayMs })
            tentativa 1: imediata
            tentativa 2: delay * 1
            tentativa 3: delay * 2
            falha definitiva → ITEM_FAILED event → log + continua próximo
```

A fila continua processando mesmo quando um item falha definitivamente.
