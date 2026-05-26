# Skill 01 — Contexto do Projeto WTT-RX

## Objetivo

WTT-RX é uma extensão de navegador criada para automatizar tarefas repetitivas no fluxo de trabalho diário. As funcionalidades incluem leitura de tela, inspeção de páginas, preenchimento assistido e organização de fluxo.

## Princípios que guiam todas as decisões

- **Utilidade imediata**: cada funcionalidade deve resolver um problema real e recorrente.
- **Mínimo de fricção**: a extensão deve agir com o mínimo de interação manual necessária.
- **Escopo fechado**: a extensão não deve tentar fazer tudo. Cada feature tem um propósito claro.
- **Evolução incremental**: novas funcionalidades entram por módulos isolados, sem quebrar o que já existe.

## Público-alvo

Usuário único (uso interno/pessoal), com conhecimento técnico. Não é um produto para distribuição em loja.

## Stack e ambiente

- Extensão Manifest V3 (Chrome/Edge)
- JavaScript puro (sem frameworks no content script)
- HTML + CSS no popup (sem frameworks obrigatórios, Tailwind permitido se já estiver no projeto)
- Sem dependências externas desnecessárias
- Sem build step obrigatório — o código deve funcionar diretamente no navegador

## O que NÃO é o projeto

- Não é um scraper de dados para terceiros
- Não é uma ferramenta de automação para fins maliciosos
- Não coleta dados do usuário para envio externo
- Não substitui um sistema — complementa o fluxo humano

## Como tomar decisões de escopo

Antes de implementar qualquer feature, responder:
1. Isso resolve um problema real que ocorre com frequência?
2. Pode ser feito de forma segura sem afetar outras páginas?
3. É reversível ou desativável facilmente?

Se a resposta a qualquer uma for "não", discutir antes de implementar.
