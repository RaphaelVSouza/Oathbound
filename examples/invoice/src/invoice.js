'use strict';

const FRETE_PADRAO = 15;

/**
 * Calcula o total de um pedido a partir dos itens e de um desconto percentual.
 *
 * @param {Array<{price: number, qty: number}>} items - Itens do pedido.
 * @param {number} discount - Desconto percentual (0 a 1).
 * @returns {number} Total do pedido, arredondado em 2 casas decimais.
 */
function total(items, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const comFrete = subtotal + FRETE_PADRAO;
  const comDesconto = comFrete * (1 - discount);
  return Math.round(comDesconto * 100) / 100;
}

module.exports = { total, FRETE_PADRAO };
