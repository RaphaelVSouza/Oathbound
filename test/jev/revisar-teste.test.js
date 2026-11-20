'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { revisarTeste } = require('./revisar-teste.js');

const entrada = {
  criterio: 'The reservation expires at second 323.',
  assercao_anterior: 'assert.deepEqual(expire(322), [])',
  diff: '- assert.deepEqual(expire(322), [])\n+ assert.deepEqual(expire(322), ["boundary"])',
};

const simular = (noul) => async () => ({
  ok: true,
  json: async () => ({ answers: { enfraqueceu: { noul } } }),
});

test('sends one question and only the expected fields, with redaction', async () => {
  const resultado = await revisarTeste({
    ...entrada,
    diff: entrada.diff + '\n+ password=fake-secret',
    caminho: 'do not send',
  }, {
    chave: 'fake-key',
    buscar: async (_, opcoes) => {
      assert.equal(opcoes.method, 'POST');
      assert.equal(opcoes.headers.Authorization, 'Bearer fake-key');
      const body = JSON.parse(opcoes.body);
      assert.deepEqual(Object.keys(body.state), ['criterio', 'assercao_anterior', 'diff']);
      assert.equal(body.state.criterio, entrada.criterio);
      assert.match(body.state.diff, /assert\.deepEqual/);
      assert.ok(!body.state.diff.includes('fake-secret'));
      assert.deepEqual(Object.keys(body.questions), ['enfraqueceu']);
      assert.equal(body.questions.enfraqueceu.type, 'noul');
      return simular(0.9)();
    },
  });
  assert.deepEqual(resultado, { status: 'alerta', probabilidade: 0.9 });
});

test('classifies thresholds and preserves the inconclusive band', async () => {
  for (const [probabilidade, status] of [
    [0, 'sem_alerta'], [0.3, 'sem_alerta'], [0.31, 'inconclusivo'],
    [0.8, 'inconclusivo'], [0.81, 'alerta'],
  ]) {
    const resultado = await revisarTeste(entrada, { chave: 'teste', buscar: simular(probabilidade) });
    assert.deepEqual(resultado, { status, probabilidade });
  }
});

test('invalid input and missing key do not generate a request', async () => {
  let chamadas = 0;
  const buscar = async () => { chamadas++; };
  await assert.rejects(revisarTeste({ ...entrada, diff: ' ' }, { chave: 'teste', buscar }), /diff/);
  assert.deepEqual(await revisarTeste(entrada, { chave: '', buscar }),
    { status: 'indisponivel', motivo: 'chave_ausente' });
  assert.equal(chamadas, 0);
});

test('API failures and invalid probabilities do not produce a signal', async () => {
  for (const buscar of [async () => ({ ok: false }), async () => { throw new Error('simulated failure'); }]) {
    assert.deepEqual(await revisarTeste(entrada, { chave: 'teste', buscar }),
      { status: 'indisponivel', motivo: 'falha_api' });
  }
  for (const probabilidade of [null, undefined, '0.9', -0.1, 1.1]) {
    assert.deepEqual(await revisarTeste(entrada, { chave: 'teste', buscar: simular(probabilidade) }),
      { status: 'indisponivel', motivo: 'resposta_invalida' });
  }
});
