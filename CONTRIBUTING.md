# Como Contribuir

Agradecemos o interesse em contribuir com o **Oathbound**! Este documento orienta o processo de colaboração, diretrizes de arquitetura e padrões de qualidade do repositório.

## Princípios de Design

1. **Independência de consumidor**: o repositório não contém caminhos absolutos, hosts, segredos ou regras particulares de projetos consumidores.
2. **Zero dependências externas (`npm`)**: as ferramentas e módulos utilizam exclusivamente recursos nativos do Node.js 24+, sem pacotes de terceiros.
3. **Módulos profundos**: interfaces enxutas e bem documentadas com JSDoc.

## Validações Obrigatórias

```bash
# Rodar suíte de testes unitários com cobertura
node --test --experimental-test-coverage test/*.test.ts test/*/*.test.js

# Auditar integridade documental (links e âncoras)
node tools/audit-docs.ts

# Auditar arquivos preparados no índice do Git
node tools/audit-docs.ts --staged
```

Todas as validações devem passar sem erros (`0 violações`).

## Padrão de Commits

Utilizamos o padrão **Conventional Commits** (ex: `feat(hooks): adiciona guardrail`):
- `feat`: nova funcionalidade para agentes ou scripts de governança
- `fix`: correção de comportamento inesperado
- `refactor`: refatoração interna sem alteração de comportamento
- `docs`: alterações exclusivamente documentais
- `test`: inclusão ou ajuste de testes
- `chore`: manutenção geral do repositório

## Licença

Licenciado sob os termos da licença [MIT](LICENSE).
