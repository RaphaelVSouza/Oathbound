---
name: agent-governance
description: Orquestrar exploração, edição, validação, revisão e filas de issues com agentes OpenCode em um projeto que instalou o Agent Governance Kit. Use quando o usuário pedir delegação, auditoria de mudanças, execução de fila ou investigação com recibos compactos.
---

# Governança de agentes

Leia primeiro o `AGENTS.md` do projeto e as instruções da área. O projeto
define a tarefa, os comandos de aceite, os dados e as ações autorizadas; esta
skill fornece os papéis e wrappers.

## Escolha do papel

| Trabalho | Agente | Invocação |
| --- | --- | --- |
| Pergunta fechada sobre código | `ds-explorer` | `opencode run --agent ds-explorer` |
| Edição mecânica | `ds-worker` | `ds-run.sh -a ds-worker` quando concorrer com outros editores |
| Implementação com comandos | `ds-runner` | `ds-run.sh` |
| Revisão fria | `ds-reviewer` | `opencode run --agent ds-reviewer` |
| Registro documental | `ds-governance` | `ds-run.sh -a ds-governance` se houver edições concorrentes |
| Auditoria por mutação | `ds-mutant` | `ds-run.sh -a ds-mutant`, em série |

Use um agente nomeado; o agente padrão do OpenCode não recebe as permissões
destes papéis. Passe ao agente uma tarefa fechada, os caminhos permitidos,
aceite com valor esperado e estado inicial do worktree. O modelo é configurado
no projeto; `GOVKIT_MODEL` é uma substituição opcional para os wrappers.

## Execução

1. Identifique o repositório Git e leia o aceite já definido pelo projeto.
2. Escolha o menor papel capaz de executar a tarefa. Para edição ou teste com
   escopo vigiado, chame `scripts/ds-run.sh` com `-d` e `-s`.
3. Rode chamadas longas em background. Leia o recibo e apenas os trechos de
   log necessários para conferir os pontos decisivos.
4. Confira o diff e o estado Git. Um exit `3` do wrapper indica mudança fora
   do escopo que exige revisão; ele não reverte arquivos.
5. Para várias issues, use `scripts/ds-queue.sh` conforme
   [queue.md](references/queue.md). O script não corrige achados, commita nem
   marca tickets como concluídos.

Saídas longas de teste/build/lint passam por `scripts/quiet.sh`. Números e
status de aceite são válidos apenas com comando executado ou fonte indicada.
Para mutação, consulte [mutation.md](references/mutation.md) antes do disparo.

## Limites

O wrapper mede mudanças antes/depois e registra posse por glob. Permissões de
shell do OpenCode casam texto e podem ser contornadas por ofuscação. Use o
aceite do projeto e revisão humana para decisões irreversíveis ou com dados.
Não use este pacote como fonte de regras de negócio de outro repositório.
