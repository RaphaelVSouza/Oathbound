---
name: test-strategy
description: >-
  Projeta estratégia e matriz de testes para código crítico, complexo ou legado.
  Use para escolher o nível certo de teste (unit, integração, contrato, E2E) e
  cobrir invariantes e modos de falha sem mocks frágeis.
---

# Estratégia de Testes

Assuma que quem acionou é um engenheiro de software: priorize risco, invariantes e determinismo, sem repetir conceitos básicos de testes.

1. **Mapeie risco e invariantes:** leia o código/spec alvo e liste o que não pode falhar (regras de negócio, contratos, estado persistido, segurança, concorrência).
2. **Construa a matriz de casos:** cubra explicitamente:
   - Caminho feliz mínimo.
   - Bordas e limites (vazio, nulo, máximo, ordenação, fuso/encoding).
   - Modos de falha (erro de rede/IO, timeout, input inválido, falha parcial).
   - Estado e concorrência (idempotência, retry, ordem de eventos), quando aplicável.
3. **Escolha o nível mínimo eficaz:** prefira o nível mais rápido e determinístico que prove o comportamento real (unit -> integração -> contrato -> E2E).
4. **Evite mocks frágeis:** teste comportamento observável nas fronteiras, não detalhes privados de implementação. Só isole dependências externas lentas ou não determinísticas.
5. **Defina critério de validação:** indique comandos exatos de execução filtrada e o que prova cada bloco de teste.
