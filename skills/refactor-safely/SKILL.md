---
name: refactor-safely
description: >-
  Conduz refatoração estrutural sem alteração de comportamento observável. Use
  quando a mudança for maior que um patch cirúrgico, mas não exigir migração de
  dados/protocolo.
---

# Refatorar com Segurança

Assuma que quem acionou é um engenheiro de software: foque em preservação de comportamento, invariantes e passos reversíveis, sem teoria genérica.

1. **Delimite o alvo:** identifique exatamente o acoplamento, duplicação ou dívida a remover e o que fica fora de escopo.
2. **Trave o comportamento antes de mover código:** verifique a cobertura atual. Se faltarem testes no ponto de corte, escreva testes de caracterização primeiro e confirme que passam.
3. **Não misture feature com refatoração:** nenhuma mudança de regra de negócio, contrato público ou correção paralela no mesmo passo.
4. **Execute em passos atômicos e reversíveis:** cada passo mantém compilação e testes verdes (ex.: extrair -> adaptar chamadores -> remover código morto).
5. **Valide regressão:** execute a suíte focada a cada bloco relevante e a validação completa ao final.
6. **Reporte objetivamente:** arquivos alterados, invariantes preservadas, validações executadas e eventuais pendências.
