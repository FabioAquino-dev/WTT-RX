# WTT-RX — Fluxo de Automação

## Fluxo principal

```
INÍCIO
  │
  ├─ Usuário abre o popup
  ├─ Clica em "Iniciar"
  │
  ▼
[content/index.js] recebe START_AUTOMATION
  │
  ├─ StatusBadge → "executando..."
  ├─ Queue.resume()
  │
  ▼
[ExamReader.scanPendingList(listaSupSelector)]
  │
  ├─ Para cada item da lista superior:
  │     classifica: PENDING_RED | LOADING | YELLOW | DONE
  │
  ├─ Filtra: apenas PENDING_RED (vermelho + "?")
  ├─ Ignora: LOADING (símbolo de tempo/spinner)
  │
  ▼
[Queue] enfileira cada PENDING_RED como ASSOCIATE_EXAM
  │
  └─ Para cada item da fila:
       │
       ├─ ExamReader.readCurrentExam()
       │     lê: nome paciente, prontuário, nº acesso
       │
       ├─ PatientMatcher.findMatch(examData, listaInfSelector)
       │     estratégia 1: prontuário (identificador único)
       │     estratégia 2: número de acesso
       │     estratégia 3: nome do paciente (fuzzy, último recurso)
       │
       ├─ ExamAssociator.associate(matchedElement)
       │     localiza pasta amarela no elemento correspondente
       │     verifica que está ativa/clicável
       │     clica
       │     aguarda confirmação da página
       │     verifica estado de sucesso
       │
       └─ se erro → Retry.withRetry (até maxAttempts)
                    se esgotado → registra log + continua próximo
  │
  ▼
[QUEUE_EMPTY event]
  │
  ├─ Verificar: ainda há itens PENDING_RED?
  │     SIM → reiniciar ciclo
  │     NÃO → prosseguir para liberação de amarelos
  │
  ▼
[ExamAssociator.releaseYellowExams(listaSupSelector)]
  │
  ├─ Para cada item YELLOW:
  │     localiza ação de liberação
  │     executa
  │     verifica resultado
  │
  ▼
[StatusBadge → "concluído"]
FIM
```

## Tratamento de casos especiais

| Caso | Comportamento |
|---|---|
| Item em estado LOADING | Ignorar na passagem atual; reavaliado na próxima iteração do observer |
| Correspondência de paciente não encontrada | Registrar aviso + pular item + continuar |
| Confirmação de associação não recebida | Retry até maxAttempts, depois registrar erro e continuar |
| Página navega durante automação | PageStateObserver detecta e pausa a fila para reavaliação |
| Automação interrompida pelo usuário | Queue.pause() — estado preservado, pode ser retomado |

## Estados da automação

```
IDLE ──[start]──▶ RUNNING ──[stop]──▶ PAUSED ──[resume]──▶ RUNNING
                     │
                     └──[erro fatal]──▶ ERROR ──[reiniciar]──▶ IDLE
```

## Comunicação durante o fluxo

```
Popup (usuário clica "Iniciar")
    │ sendMessage(START_AUTOMATION)
    ▼
Background (service-worker.js)
    │ tabs.sendMessage(START_AUTOMATION) → aba ativa
    ▼
Content Script (index.js)
    │ Queue.resume()
    │ StatusBadge.setState('running', ...)
    │
    └── fluxo de automação acima
```
