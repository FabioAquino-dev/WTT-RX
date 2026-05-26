# Skill 04 — UI/UX da Extensão

## Princípios

- **Rápido de usar**: o popup deve carregar instantaneamente. Zero loading screens desnecessárias.
- **Claro sem manual**: o usuário entende o que cada botão faz sem documentação.
- **Não intrusivo**: a extensão não deve atrapalhar o uso normal das páginas.
- **Consistente**: mesma paleta, mesmos espaçamentos, mesma tipografia em todas as telas.

## Popup

- Largura máxima recomendada: `380px`.
- Altura máxima recomendada: `500px` (evitar scroll sempre que possível).
- Estrutura padrão:
  ```
  [cabeçalho com nome/logo]
  [área de conteúdo principal]
  [rodapé com versão ou ações secundárias]
  ```
- Botões de ação principal: sempre visíveis, sem precisar rolar.
- Estados de feedback obrigatórios: loading, sucesso, erro.

## Feedback visual

- Toda ação do usuário deve ter resposta visual em menos de 200ms.
- Usar classes CSS para estados (`.is-loading`, `.is-success`, `.is-error`) — não manipular estilos inline.
- Mensagens de erro devem ser humanas: "Não foi possível ler a página" em vez de "TypeError: null".
- Mensagens de sucesso devem ser breves e desaparecer após 2-3 segundos.

## Injeções visuais na página (overlays, tooltips, badges)

- Sempre usar Shadow DOM para isolar estilos da extensão dos estilos da página.
- Prefixar todas as classes CSS com `wttrx-` para evitar conflitos.
- Elementos injetados devem ter z-index controlado (documentar o valor usado).
- Sempre fornecer botão ou atalho para fechar/ocultar elementos injetados.

## Acessibilidade mínima

- Botões devem ter `aria-label` descritivo se não tiverem texto visível.
- Contraste mínimo: 4.5:1 para texto normal (WCAG AA).
- Não depender somente de cor para comunicar estado.

## Dark mode

- Se implementado, usar `prefers-color-scheme` via CSS.
- Não implementar dark mode pela metade — ou suporta completamente ou não suporta.

## Ícones

- Usar SVG inline ou ícones de uma única biblioteca (não misturar FontAwesome com Material Icons, etc.).
- Ícones devem ter `title` ou `aria-label` para acessibilidade.
