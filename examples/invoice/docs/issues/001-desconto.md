# 001 — Desconto aplicado sobre o frete

## Comportamento correto

O desconto percentual deve incidir somente sobre o subtotal dos itens. O frete
padrão (`FRETE_PADRAO = 15`) é somado **depois** do desconto, sem sofrer redução.

Fórmula correta: `total = subtotal * (1 - discount) + FRETE_PADRAO`.

## Comportamento atual (bug)

O frete é somado ao subtotal antes de aplicar o desconto, então o desconto reduz
também o valor do frete.

## Aceite

- `node --test` passa.
- Caso `total([{ price: 100, qty: 1 }], 0.1)` retorna `105` (não `103.5`).
