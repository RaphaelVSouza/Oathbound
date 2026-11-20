---
name: api-contract-design
description: >-
  Projeta ou evolui contratos HTTP, RPC ou eventos com foco em compatibilidade
  retroativa, idempotência, erros padronizados e limites explícitos.
---

# Design de Contrato de API

Assuma que quem acionou é um engenheiro de software: foque em semântica de contrato, evolução segura e modos de falha, sem teoria genérica de REST/RPC.

1. **Identifique consumidores e compatibilidade:** mapeie clientes internos/externos, versão atual e se a mudança é aditiva ou breaking.
2. **Defina a superfície do contrato:**
   - Operações/endpoints ou tópicos/eventos com nomes consistentes ao padrão local.
   - Schemas de entrada e saída com tipos, obrigatoriedade, defaults, formatos (ISO-8601, UUID, moeda/precisão) e limites de tamanho.
   - Paginação (cursor vs offset), filtros e ordenação determinística quando retornar coleções.
3. **Feche semântica operacional:**
   - **Erros:** formato padronizado, códigos estáveis e distinção clara entre erro de cliente, conflito e falha transitória.
   - **Idempotência e retry:** chaves de idempotência, semântica de reenvio e comportamento sob concorrência.
   - **Auth, rate limit e observabilidade:** escopos/permissões, limites e correlation/request ID.
4. **Documente exemplos concretos:** ao menos 1 payload de sucesso e 1 de erro representativo.
5. **Se houver mudança breaking:** especifique estratégia de versionamento ou transição compatível (use `migration` e `create-adr` quando aplicável).
