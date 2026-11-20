---
name: create-spec
description: >-
  Redige especificação técnica verificável antes da implementação de features ou
  mudanças médias/grandes. Use para fechar objetivo, fora de escopo, contratos,
  invariantes, casos de borda, plano de validação e critérios de aceite.
---

# Criar Especificação Técnica

Assuma que quem acionou é um engenheiro de software: vá direto a contratos, invariantes, trade-offs e modos de falha, sem explicações introdutórias.

1. Consulte o `AGENTS.md` aplicável e verifique se o projeto possui diretório ou template de specs. Siga a convenção local.
2. Explore o código e docs relevantes antes de redigir (ou delegue ao `scout`) para ancorar a spec em caminhos, tipos e limites reais.
3. Estruture a spec com decisões objetivas e verificáveis:
   - **Problema e objetivo:** o que muda e por quê, em poucas linhas.
   - **Escopo e fora de escopo:** fronteira explícita para evitar scope creep.
   - **Contratos e dados:** assinaturas, payloads, schemas, eventos, erros e compatibilidade retroativa.
   - **Invariantes e casos de borda:** regras que nunca podem quebrar, concorrência, idempotência, falhas parciais e limites.
   - **Plano de validação:** testes unitários, integração, contrato ou manuais necessários para provar a entrega.
   - **Critérios de aceite:** lista fechada e testável de "pronto".
4. Marque lacunas ou decisões abertas com `[DECISÃO PENDENTE]` (use `grill-me` se houver ambiguidade arquitetural relevante).
5. Se a spec introduzir decisão arquitetural significativa, indique a criação de ADR via `create-adr`.
6. Informe o caminho criado/editado e eventuais pendências antes de partir para implementação.
