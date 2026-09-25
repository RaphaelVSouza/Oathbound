# Como Contribuir

Agradecemos o interesse em contribuir com o **Oathbound**! Este documento orienta o processo de colaboração, diretrizes de arquitetura e padrões de qualidade do repositório.

## Princípios de Design

1. **Independência de consumidor**:
   O repositório do pacote não deve conter caminhos absolutos, hosts específicos, segredos ou regras particulares de projetos consumidores. O fluxo comum vive neste kit; exceções devem ser configuradas no `AGENTS.md` de cada projeto usuário.
2. **Zero dependências externas (`npm`)**:
   As ferramentas de governança e os módulos internos utilizam exclusivamente os recursos nativos do Node.js (versão 22 ou superior), como `node:sqlite`, `node:util.parseArgs` e `node:test`.
3. **Módulos profundos**:
   Interfaces públicas devem ser enxutas, bem documentadas com JSDoc e ocultar a complexidade operacional (ex.: tratamento de subprocessos em plataformas Windows/POSIX).

## Fluxo de Trabalho

1. Crie uma branch a partir de `main` com nome descritivo (ex.: `feat/nome-da-melhoria` ou `fix/descricao-do-bug`).
2. Faça as alterações necessárias mantendo a cobertura de testes e a integridade da documentação.
3. Se houver mudança de comportamento, atualize na mesma entrega:
   - `VERSION`
   - [`CHANGELOG.md`](CHANGELOG.md)
   - As referências correspondentes na documentação técnica.
4. Execute todas as validações locais antes de abrir o Pull Request.

## Validações Obrigatórias

Antes de submeter suas alterações, execute a suíte de testes e o auditor de documentação:

```bash
# Rodar suíte de testes unitários com cobertura
node --test --experimental-test-coverage test/*.test.js

# Auditar integridade documental (links, âncoras e contratos)
node tools/audit-docs.js

# Auditar arquivos preparados no índice do Git
node tools/audit-docs.js --staged
```

Todas as validações devem passar sem erros (`0 violações`).

## Padrão de Commits

Utilizamos o padrão **Conventional Commits** com escopo padronizado e mensagens em português brasileiro:

```text
<tipo>(<escopo>): <resumo imperativo>

Ticket:
- <identificador ou none>

Why:
- <motivação ou problema resolvido>

Changes:
- <principais alterações técnicas>

Validation:
- <testes e checagens realmente executados>
```

Tipos comuns:
- `feat`: nova funcionalidade para agentes ou scripts de governança
- `fix`: correção de comportamento inesperado
- `refactor`: refatoração interna sem alteração de comportamento
- `docs`: alterações exclusivamente documentais
- `test`: inclusão ou ajuste de testes unitários
- `chore`: manutenção geral do repositório

## Licença

Ao submeter contribuições para este projeto, você concorda que o código fornecido será licenciado sob os mesmos termos da licença [MIT](LICENSE).
