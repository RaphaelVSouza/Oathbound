'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { revisarTeste } = require('./revisar-teste.js');

const entrada = {
  criterio: 'A reserva expira no segundo 323.',
  assercao_anterior: 'assert.deepEqual(expire(322), [])',
  diff: '- assert.deepEqual(expire(322), [])\n+ assert.deepEqual(expire(322), ["boundary"])',
};

const simular = (noul) => async () => ({
  ok: true,
  json: async () => ({ answers: { enfraqueceu: { noul } } }),
});

test('envia uma pergunta e somente os campos previstos, com redação', async () => {
  const resultado = await revisarTeste({
    ...entrada,
    diff: entrada.diff + '\n+ password=segredo-ficticio',
    caminho: 'não enviar',
  }, {
    chave: 'chave-ficticia',
    buscar: async (_, opcoes) => {
      assert.equal(opcoes.method, 'POST');
      assert.equal(opcoes.headers.Authorization, 'Bearer chave-ficticia');
      const body = JSON.parse(opcoes.body);
      assert.deepEqual(Object.keys(body.state), ['criterio', 'assercao_anterior', 'diff']);
      assert.equal(body.state.criterio, entrada.criterio);
      assert.match(body.state.diff, /assert\.deepEqual/);
      assert.ok(!body.state.diff.includes('segredo-ficticio'));
      assert.deepEqual(Object.keys(body.questions), ['enfraqueceu']);
      assert.equal(body.questions.enfraqueceu.type, 'noul');
      return simular(0.9)();
    },
  });
  assert.deepEqual(resultado, { status: 'alerta', probabilidade: 0.9 });
});

test('classifica os limiares e preserva a faixa inconclusiva', async () => {
  for (const [probabilidade, status] of [
    [0, 'sem_alerta'], [0.3, 'sem_alerta'], [0.31, 'inconclusivo'],
    [0.8, 'inconclusivo'], [0.81, 'alerta'],
  ]) {
    const resultado = await revisarTeste(entrada, { chave: 'teste', buscar: simular(probabilidade) });
    assert.deepEqual(resultado, { status, probabilidade });
  }
});

test('entrada inválida e chave ausente não geram requisição', async () => {
  let chamadas = 0;
  const buscar = async () => { chamadas++; };
  await assert.rejects(revisarTeste({ ...entrada, diff: ' ' }, { chave: 'teste', buscar }), /diff/);
  assert.deepEqual(await revisarTeste(entrada, { chave: '', buscar }),
    { status: 'indisponivel', motivo: 'chave_ausente' });
  assert.equal(chamadas, 0);
});

test('falhas de API e probabilidades inválidas não produzem sinal', async () => {
  for (const buscar of [async () => ({ ok: false }), async () => { throw new Error('falha simulada'); }]) {
    assert.deepEqual(await revisarTeste(entrada, { chave: 'teste', buscar }),
      { status: 'indisponivel', motivo: 'falha_api' });
  }
  for (const probabilidade of [null, undefined, '0.9', -0.1, 1.1]) {
    assert.deepEqual(await revisarTeste(entrada, { chave: 'teste', buscar: simular(probabilidade) }),
      { status: 'indisponivel', motivo: 'resposta_invalida' });
  }
});
