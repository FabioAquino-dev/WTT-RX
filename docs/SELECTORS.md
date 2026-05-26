# WTT-RX — Mapeamento de Seletores DOM

Este documento deve ser preenchido durante a fase de inspeção do sistema legado.
É o pré-requisito para implementar os módulos de automação.

## Como inspecionar

1. Abrir o sistema de radiologia no Chrome
2. Abrir DevTools (F12) → aba Elements
3. Usar a ferramenta de seleção (Ctrl+Shift+C) para identificar os elementos
4. Registrar abaixo os seletores mais estáveis (preferir atributos data-*, id, role)

---

## Lista superior — exames pendentes

| Elemento | Seletor | Observações |
|---|---|---|
| Container da lista | `???` | |
| Item/linha individual | `???` | |
| Item vermelho (pendente) | `???` | identificar pela classe de cor ou ícone "?" |
| Item com spinner/carregando | `???` | deve ser ignorado |
| Item amarelo | `???` | liberação posterior |
| Identificador do exame | `???` | atributo id ou data-* do item |

## Lista inferior — pacientes

| Elemento | Seletor | Observações |
|---|---|---|
| Container da lista | `???` | |
| Linha de paciente | `???` | |
| Campo prontuário | `???` | identificador primário para matching |
| Campo nome | `???` | |
| Campo número de acesso | `???` | |
| Pasta amarela (ação) | `???` | elemento clicável para associação |
| Estado desabilitado | `???` | quando não é possível associar |

## Painel/modal de exame aberto

| Elemento | Seletor | Observações |
|---|---|---|
| Container do painel | `???` | |
| Nome do paciente | `???` | |
| Prontuário | `???` | |
| Número de acesso | `???` | |
| Botão de confirmação | `???` | após associação |
| Mensagem de sucesso | `???` | confirmar resultado |
| Mensagem de erro | `???` | detectar falha |

## Sinais de carregamento/transição

| Estado | Indicador | Seletor |
|---|---|---|
| Página carregando | `???` | |
| Modal abrindo | `???` | |
| Operação em progresso | `???` | |

---

## Notas de implementação

- Verificar se os seletores se mantêm estáveis entre sessões (não usar IDs gerados dinamicamente)
- Preferir `data-*` > `id` > `class` estável > texto visível
- Documentar variações (o sistema pode usar seletores diferentes em estados diferentes)
- Testar em pelo menos 3 sessões diferentes antes de considerar um seletor confiável
