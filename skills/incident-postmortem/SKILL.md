---
name: incident-postmortem
description: >-
  Redige postmortem técnico objetivo após mitigação ou diagnóstico de incidente.
  Use para registrar linha do tempo, impacto, causa raiz e ações preventivas
  verificáveis.
---

# Postmortem de Incidente

Assuma que quem acionou é um engenheiro de software: mantenha tom factual e sem caça às bruxas (blameless), separando fatos verificados de hipóteses.

1. **Colete evidências:** reúna logs, métricas, commits, PRs, alertas e horários reais. Não invente timestamps ou causas não comprovadas; marque lacunas como `[A CONFIRMAR]`.
2. **Estruture o documento:**
   - **Resumo executivo:** o que falhou, duração e impacto mensurável (usuários, requisições, dados, SLA).
   - **Linha do tempo (UTC ou fuso explícito):** detecção, triagem, mitigação e recuperação.
   - **Causa raiz e fatores contribuintes:** mecanismo técnico exato e por que as barreiras existentes não impediram ou não detectaram antes.
   - **O que funcionou / o que falhou:** detecção, runbooks, rollback, observabilidade.
   - **Ações corretivas e preventivas:** tabela com tipo (`imediata` | `estrutural`), descrição objetiva, dono, prazo e critério de verificação.
3. **Conecte com o fluxo:** se uma ação exigir mudança arquitetural, aponte ADR (`create-adr`); se exigir migração ou correção, aponte `migration` ou `surgical-patch`.
4. **Informe o caminho salvo e lacunas pendentes** para revisão dos envolvidos.
