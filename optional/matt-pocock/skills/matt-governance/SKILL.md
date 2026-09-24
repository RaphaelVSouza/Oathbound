---
name: matt-governance
description: Escolhe e conduz, quando solicitado, triagem, especificação, tickets e execução de trabalho governado no projeto.
---

# Fluxo opcional de governança

Leia primeiro `AGENTS.md` e as convenções do tracker do projeto. Use a etapa
necessária para a solicitação atual; uma correção pequena não exige uma cadeia
completa de documentos. Não crie issue, spec ou plano sem pedido ou convenção
explícita do projeto.

| Situação | Etapa / skill original equivalente | Resultado |
| --- | --- | --- |
| Pedido bruto ou issue sem classificação | `triage` | Estado, lacunas e próximo responsável. |
| Decisão de produto ou arquitetura já discutida | `to-spec` | Spec com objetivo, limites e aceite. |
| Spec aprovada precisa ser distribuída | `to-tickets` | Tickets verticais, dependências e aceite por entrega. |
| Ticket pronto para execução | `implement-spec` | Entrega com revisão e evidência de aceite. |
| Mudança em instruções para agentes | `writing-for-agents` | Instrução curta, localizada e verificável. |
| Plano ainda ambíguo, com pedido explícito de crítica | `grilling` | Decisões e questões resolvidas antes da spec. |

As skills originais podem existir no ambiente do operador; este módulo não
depende delas. Para triagem, spec e tickets, siga as referências locais:
[triage.md](references/triage.md), [to-spec.md](references/to-spec.md) e
[to-tickets.md](references/to-tickets.md). Para execução, siga as regras de
papéis, escopo e fila da skill `agent-governance` e o contrato do projeto.

O agente `ds-governance` prepara e mantém artefatos documentais. Ele não inicia
execução, não aprova a própria spec e não transforma sua permissão de editar
`.scratch/` em escolha automática de tracker. Registre `PENDENTE` quando uma
decisão necessária não tiver sido tomada.
