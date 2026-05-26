# WTT-RX

Extensão Chrome para automação do fluxo de associação e liberação de exames em sistema de radiologia legado.

---

## Objetivo

Automatizar o ciclo repetitivo de:
1. Detectar exames pendentes (itens vermelhos com "?") na lista superior
2. Ler os dados do exame (nome, prontuário, número de acesso)
3. Localizar o paciente correspondente na lista inferior
4. Clicar na pasta amarela correta para associar
5. Liberar exames amarelos ao final de cada ciclo

A automação opera exclusivamente via DOM, texto e estados da interface — sem coordenadas fixas, sem dependência de resolução de tela.

---

## Status

**Fase atual: Fundação**

- Arquitetura modular completa
- Infraestrutura de fila, retry e logging operacional
- Módulos de automação aguardam mapeamento de seletores DOM
- Ver `docs/SELECTORS.md` para o checklist de inspeção

---

## Estrutura

```
WTT-RX/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.js       roteamento de mensagens, persistência de config
│   ├── content/
│   │   ├── core/
│   │   │   ├── constants.js        namespace WTTRX, constantes globais
│   │   │   ├── logger.js           logging estruturado com prefixo [WTT-RX][contexto]
│   │   │   └── config.js           configuração persistida via chrome.storage
│   │   ├── services/
│   │   │   ├── storage.js          abstração chrome.storage.local
│   │   │   └── messaging.js        abstração chrome.runtime.sendMessage
│   │   ├── queue/
│   │   │   ├── retry.js            backoff linear, tolerância a falhas
│   │   │   └── queue.js            fila async com executores registráveis
│   │   ├── observers/
│   │   │   ├── page-state.observer.js   mudanças gerais de página (debounced)
│   │   │   └── exam-list.observer.js    novos itens na lista de exames
│   │   ├── automation/
│   │   │   ├── exam-reader.js      lê dados do exame aberto
│   │   │   ├── patient-matcher.js  localiza paciente por prontuário/acesso/nome
│   │   │   └── exam-associator.js  executa associação e liberação
│   │   ├── ui/
│   │   │   ├── overlay.js          Shadow DOM host (isolado da página)
│   │   │   └── status-badge.js     badge de status fixo na página
│   │   └── index.js                entry point do content script
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── options/
│       ├── options.html
│       ├── options.css
│       └── options.js
├── assets/
│   └── icons/                      ícones PNG (gerados por scripts/generate-icons.py)
├── docs/
│   ├── ARCHITECTURE.md             diagrama e decisões de arquitetura
│   ├── FLOW.md                     fluxo de automação detalhado
│   └── SELECTORS.md                checklist de seletores DOM a mapear
├── scripts/
│   └── generate-icons.py           gera ícones placeholder
└── .claude/skills/                 guias de desenvolvimento do projeto
```

---

## Instalação (desenvolvimento)

1. Abrir `chrome://extensions`
2. Ativar **Modo desenvolvedor**
3. Clicar em **Carregar sem compactação**
4. Selecionar a pasta raiz `WTT-RX/`

Para regenerar os ícones:
```bash
python3 scripts/generate-icons.py
```

---

## Próximos passos

1. **Mapear o DOM do sistema legado** — preencher `docs/SELECTORS.md`
2. **Implementar `ExamReader.scanPendingList()`** com os seletores mapeados
3. **Implementar `PatientMatcher.findMatch()`** com a estratégia de matching
4. **Implementar `ExamAssociator.associate()`** com a lógica de clique e confirmação
5. **Restringir `host_permissions`** no `manifest.json` para o domínio específico do sistema

---

## Configurações

Acessíveis pelo popup → Configurações (ou `chrome://extensions` → Detalhes → Opções da extensão).

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `retryMaxAttempts` | 3 | Tentativas por item antes de desistir |
| `retryDelayMs` | 1500 | Delay base entre tentativas (ms) |
| `actionDelayMs` | 800 | Pausa entre cada item da fila |
| `observerDebounceMs` | 500 | Janela de debounce do MutationObserver |
| `autoStart` | false | Iniciar automaticamente ao carregar a página |
| `debugMode` | true | Ativar logs detalhados no Console |

---

## Debug

| Contexto | Como inspecionar |
|---|---|
| Popup | Botão direito no popup → Inspecionar |
| Content script | DevTools da aba → Console |
| Service worker | `chrome://extensions` → WTT-RX → Service Worker → Inspecionar |

Logs seguem o formato: `[WTT-RX][contexto] mensagem`

---

## Princípios técnicos

- Sem coordenadas fixas — automação baseada em DOM, texto e estado
- Sem dependência de resolução de tela
- Shadow DOM para isolamento total de estilos
- Fila com retry e tolerância a falhas — um erro não para o processo
- Sem build step — funciona diretamente no Chrome
- Manifest V3, JavaScript puro

---

## Versionamento

Segue [Semantic Versioning](https://semver.org/). Commits seguem [Conventional Commits](https://www.conventionalcommits.org/).

```
v0.1.0  — fundação: arquitetura, infraestrutura, popup, options
v0.2.0  — (próximo) automação de associação implementada
v0.3.0  — liberação de amarelos
v1.0.0  — versão estável completa
```
