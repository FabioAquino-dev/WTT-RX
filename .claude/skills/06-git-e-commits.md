# Skill 06 — Git e Commits

## Estrutura de branches

```
main          → código estável, funcional
feature/xxx   → nova funcionalidade
fix/xxx       → correção de bug
chore/xxx     → tarefas de manutenção (deps, config, refactor sem impacto funcional)
```

- Nunca commitar diretamente em `main` durante desenvolvimento ativo.
- Uma branch por funcionalidade ou correção.

## Convenção de commits (Conventional Commits)

Formato:
```
<tipo>(<escopo>): <descrição curta em imperativo>
```

Tipos válidos:

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `chore` | Manutenção, configuração, sem impacto funcional |
| `refactor` | Reestruturação sem mudança de comportamento |
| `docs` | Documentação |
| `style` | Formatação, indentação (sem mudança de lógica) |
| `test` | Testes |

Exemplos:
```
feat(popup): adiciona botão de leitura de formulário
fix(content): corrige seletor do campo CPF na página de cadastro
chore(manifest): adiciona permissão activeTab
refactor(background): extrai lógica de mensagem para módulo separado
```

## Tamanho dos commits

- Um commit = uma mudança coerente.
- Não agrupar feature + fix + chore no mesmo commit.
- Commits pequenos são melhores do que commits grandes.

## O que NÃO commitar

- Arquivos de debug temporários
- `console.log` de desenvolvimento (flag DEBUG ligada)
- Credenciais, tokens ou senhas
- Arquivos gerados automaticamente que não pertencem ao projeto
- `.env` ou equivalentes

## .gitignore mínimo para extensão Chrome

Garantir que estes padrões estejam no `.gitignore`:
```
node_modules/
*.log
.DS_Store
dist/
*.zip
```

## Tags de versão

Usar versionamento semântico nas tags:
```
v0.1.0  → primeira versão funcional
v0.1.1  → correção de bug
v0.2.0  → nova funcionalidade adicionada
v1.0.0  → versão estável e completa
```

Criar tag após merge em `main` de versão estável:
```bash
git tag -a v0.1.0 -m "feat: primeira versão do popup e content script"
```

## Pull Requests (se aplicável)

- Título do PR segue a mesma convenção de commits.
- Descrição deve incluir: o que muda, por que muda, como testar.
- Não aprovar PR com erros de console não tratados ou permissões desnecessárias.
