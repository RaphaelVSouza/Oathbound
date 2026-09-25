# Modelos, Reasoning Effort e Prompt Caching

Esta referência documenta as diretrizes perenes para seleção de modelos, controle de
esforço de raciocínio (*reasoning effort*) e otimização de *prompt caching* no
Agent Governance Kit.

## 1. Princípio do ambiente como fonte da verdade

O kit não fixa modelos em código nem em tabelas estáticas. Nomes de modelos,
famílias e preços mudam continuamente no ecossistema de IA.

Consulte a lista viva e atualizada de modelos disponíveis consultando diretamente
a CLI em uso no ambiente:

- **OpenCode:** `opencode models`
- **AGY:** `agy models`
- **Claude Code:** `claude --help`
- **Codex:** `codex --help`

No projeto, configure o modelo desejado passando `-m <modelo>` aos scripts ou
definindo a variável de ambiente `GOVKIT_MODEL`.

## 2. Invariante do Prompt Caching (KV Cache)

Os principais provedores (Anthropic, OpenAI, Google) utilizam **prefix matching
exato a nível de bytes**. Qualquer alteração de um único byte no início do prompt
invalida todo o cache subsequente.

### Regra de ouro da ordenação do contexto

O kit organiza o prompt nas seguintes camadas para maximizar *cache hits* (>90% de economia):

1. **Camada estática (topo imutável):** Instruções do papel (`[PAPEL DO AGENTE]`) +
   regras globais e convenções locais do projeto (`AGENTS.md`).
2. **Camada semidinâmica (meio):** Guardrails de escopo da chamada (`[ESCOPO AUTORIZADO]`)
   e bloqueios de concorrência com outros agentes ativos.
3. **Camada volátil (final):** A mensagem específica da tarefa, issue, diff atual,
   recortes de log e comandos de validação.

### Práticas anti-invalidação

- **Nunca insira valores efêmeros no início:** timestamps, UUIDs de sessão gerados
  a cada turno ou tags voláteis não devem ser prefixados antes das instruções fixas.
- **Estabilidade de parâmetros:** no OpenAI e Codex, alterar parâmetros de requisição
  (`model`, `tools` ou `reasoning_effort`) invalida o cache KV. Mantenha os mesmos
  parâmetros ao longo da mesma sessão.
- **Janelas de reutilização:** Anthropic adota TTL de 5 minutos; agrupe execuções
  consecutivas da fila ou revisões para aproveitar o cache aquecido.

## 3. Matriz de Reasoning Effort

O parâmetro de esforço de raciocínio controla a profundidade de deliberação interna
do modelo antes da resposta. Utilize `-e <low|medium|high>` na CLI ou exporte
`GOVKIT_EFFORT`.

| Nível | Papéis recomendados | Quando usar | Impacto |
| --- | --- | --- | --- |
| **`low`** | `ds-explorer`, `ds-committer` | Consultas pontuais de código, citações `arquivo:linha`, agrupamento mecânico de hunks e mensagens de commit. | Menor latência e consumo mínimo de tokens. |
| **`medium`** | `ds-runner`, `ds-researcher` | Implementação de código com testes, ciclos TDD, busca e cruzamento de fontes externas. | Equilíbrio ideal entre qualidade de código e velocidade. |
| **`high`** | `ds-reviewer`, `ds-security`, `ds-governance` | Revisão fria de diffs, análise AppSec (OWASP/CWE), mapeamento de riscos e specs de arquitetura. | Máxima profundidade analítica para evitar bugs e vulnerabilidades. |

*Nota:* Evite o nível `max` ou orçamentos irrestritos para tarefas rotineiras, pois
o custo e o tempo de resposta crescem substancialmente sem ganho proporcional.

## 4. Configuração no projeto consumidor

No `AGENTS.md` do repositório consumidor, registre a convenção adotada pela equipe:

```markdown
## Preferências de IA da equipe
- Runner: claude (ou opencode)
- Modelo padrão: claude-3-7-sonnet (ou configurado via GOVKIT_MODEL)
- Effort padrão de implementação: medium
- Effort de revisão e segurança: high
```
