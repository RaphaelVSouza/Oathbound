'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { total } = require('../src/invoice.js');

test('total sem desconto soma itens e frete padrão', () => {
  const items = [{ price: 10, qty: 2 }];
  assert.equal(total(items), 35);
});

test('total com desconto e um único item', () => {
  const items = [{ price: 100, qty: 1 }];
  assert.equal(total(items, 0.1), 103.5);
});

test('total com múltiplos itens sem desconto', () => {
  const items = [
    { price: 5, qty: 3 },
    { price: 2, qty: 1 },
  ];
  assert.equal(total(items), 32);
});
