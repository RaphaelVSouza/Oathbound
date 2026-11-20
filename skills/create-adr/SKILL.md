---
name: create-adr
description: Redige registros de decisão arquitetural (ADRs). Use para propor uma decisão significativa ou atualizar uma ADR em revisão.
---

# Criar uma ADR

1. Consulte o `AGENTS.md` aplicável. Localize o diretório, o template e o guia de ADRs do projeto. Siga o padrão local. Leia o template e apenas as seções do guia pertinentes à tarefa.
2. Se houver dúvida sobre registrar a decisão, confira o critério do projeto. Na falta dele, considere o impacto arquitetural, as alternativas viáveis e o custo ou risco de reversão.
3. Para uma nova ADR, confirme que o caminho está livre e que o número segue a convenção local. Quando faltar convenção, use `docs/adr/NNNN-titulo.md` com o próximo número sequencial, contando também ADRs rejeitadas ou substituídas.
4. Crie a ADR em `Proposed`. Registre a data, quem decide, o contexto, as alternativas viáveis, a decisão proposta, as consequências e como verificar a conformidade. Marque decisões e informações em aberto com `[DECISÃO PENDENTE]`.
5. Preserve o mérito de ADRs aceitas ou rejeitadas. Para substituir uma decisão, proponha uma nova ADR que referencie a anterior. Aplique mudanças de status só após a decisão dos responsáveis e conforme o guia local.
6. Informe o caminho editado e as pendências. Deixe aprovação, commit e publicação para os responsáveis.

## Esqueleto quando faltar template

- Metadados `status: Proposed`, `date` no formato `AAAA-MM-DD` e `decision-makers`. Se os responsáveis estiverem em aberto, use uma lista vazia e marque a pendência no corpo.
- Título que afirma a decisão proposta.
- Contexto e problema, opções consideradas e decisão com justificativa.
- Consequências com trade-offs e mitigação, confirmação e referências aplicáveis.
