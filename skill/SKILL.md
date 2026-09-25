---
name: oathbound
description: Orquestrar exploração, edição, validação, revisão, commits e filas de issues com agentes (OpenCode, Claude, Codex, AGY, Generic) em um projeto que instalou o Oathbound. Use quando o usuário pedir delegação, auditoria de mudanças, commits, execução de fila ou investigação com recibos compactos.
---

# Governança de agentes

Leia primeiro o `AGENTS.md` do projeto e as instruções da área. O projeto
define a tarefa, os comandos de aceite, os dados e as ações autorizadas; esta
skill fornece os papéis e wrappers.

## Escolha do papel

| Trabalho | Agente | Invocação |
| --- | --- | --- |
| Orquestração da guilda | `oathkeeper` | agente primário; ver [docs/runners](../docs/runners/README.md) |
| Pergunta fechada sobre código | `surveyor` | `node run.js -R -a surveyor` |
| Pesquisa em fontes externas | `scholar` | `node run.js -R -a scholar` |
| Spec, tickets, decisões e instruções de agentes (antes) | `scribe` | `node run.js -a scribe -s <glob>` |
| Implementação com comandos | `smith` | `node run.js -s <glob>` |
| Revisão fria | `assayer` | `node run.js -R -a assayer` |
| README, CHANGELOG e guias (depois, com base no Git) | `herald` | `node run.js -a herald -s <glob>` |
| Preparação de hunks e commits | `archivist` | `node run.js -a archivist -s <arquivo>` |
| Auditoria por mutação | `breaker` | `node run.js -a breaker -s <glob>`, em série |
| Auditoria de segurança de aplicação | `warden` | `node run.js -R -a warden` |

A disciplina do oathkeeper (escolha do papel, tarefa fechada, conferência de
diff/status/recibo e decisão) vive em [`guild/oathkeeper.md`](../guild/oathkeeper.md);
este documento resume os papéis e aponta para lá.

Use um agente nomeado; o agente padrão do OpenCode não recebe as permissões
destes papéis. Passe ao agente uma tarefa fechada, os caminhos permitidos,
aceite com valor esperado e estado inicial do worktree. O modelo é configurado
no projeto; `OATHBOUND_MODEL` e `-m` substituem opcionalmente nos wrappers; `-e` e
`OATHBOUND_EFFORT` definem o esforço de raciocínio conforme [models.md](references/models.md).
Edições mecânicas também vão para `smith`. Para `scholar`, delimite
a pergunta; o agente devolve fontes primárias e lacunas na resposta, enquanto
o oathkeeper decide o próximo passo.

## Execução

1. Identifique o repositório Git e leia o aceite já definido pelo projeto.
2. Escolha o menor papel capaz de executar a tarefa. A partir da raiz do projeto,
   chame `node .claude/skills/oathbound/scripts/run.js`
   com `-d`; use `-u <runner>` para selecionar o runner desejado (`opencode`, `claude`,
   `codex`, `agy`, `generic`; padrão: `opencode`); use `-e <low|medium|high>`
   para definir o esforço de raciocínio; use `-R` para os agentes sem edição e
   `-s` para os que editam.
3. Rode chamadas longas em background. Leia o recibo e apenas os trechos de
   log necessários para conferir os pontos decisivos.
4. Confira o diff e o estado Git. Um exit `3` indica mudança fora do escopo
   ou durante leitura; confira a autoria antes de agir. O wrapper não reverte
   arquivos.
5. Para várias issues, use `node .claude/skills/oathbound/scripts/queue.js` conforme
   [queue.md](references/queue.md). O script não corrige achados, commita nem
   marca tickets como concluídos.
6. Quando houver pedido de commit, delegue a seleção de hunks e mensagens ao
   `archivist` conforme [commits.md](references/commits.md).

Saídas longas de teste/build/lint passam por `node .claude/skills/oathbound/scripts/quiet.js`. Números e
status de aceite são válidos apenas com comando executado ou fonte indicada.
Para mutação, consulte [mutation.md](references/mutation.md) antes do disparo.
Para perguntar andamento, bloqueios, evidências ou entrega à sessão já iniciada,
use os comandos de [feedback.md](references/feedback.md).

## Limites

O wrapper mede mudanças antes/depois e registra posse por glob. Permissões de
shell do OpenCode casam texto e podem ser contornadas por ofuscação. Use o
aceite do projeto e revisão humana para decisões irreversíveis ou com dados.
Não use este pacote como fonte de regras de negócio de outro repositório.

`scribe` levanta probabilidade e impacto de um risco com fonte, mas não
prioriza. Definir prioridade entre riscos ou issues é do oathkeeper: só ele
enxerga a fila inteira, prazos e decisões de negócio fora do escopo de uma
única spec. O `scribe` escreve antes do trabalho (spec, tickets, decisões,
instruções de agentes); o `herald` documenta depois (README, CHANGELOG, guias),
sempre com base nos commits, no diff e nas saídas de comando.
