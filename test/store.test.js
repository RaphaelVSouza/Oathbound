const test = require('node:test');
const assert = require('node:assert/strict');
const { OathboundStore, openStore, isSqliteAvailable } = require('../skill/scripts/store.ts');

test('store: verifica disponibilidade de node:sqlite no Node 24+', () => {
  assert.equal(isSqliteAvailable(), true);
});

test('store: grava e recupera estagio da fila', () => {
  const store = openStore(':memory:');
  try {
    assert.equal(store.getStage('task-01'), null);

    store.setStage('task-01', 'implementada');
    assert.equal(store.getStage('task-01'), 'implementada');

    store.setStage('task-01', 'revisada');
    assert.equal(store.getStage('task-01'), 'revisada');

    store.setStage('task-02', 'falhou', '/tmp/task-02.log');
    assert.equal(store.getStage('task-02'), 'falhou');

    const all = store.getAllStages();
    assert.equal(all.length, 2);
    assert.equal(all[0].id, 'task-01');
    assert.equal(all[1].id, 'task-02');
    assert.equal(all[1].log_path, '/tmp/task-02.log');
  } finally {
    store.close();
  }
});

test('store: registra, recupera e libera claims de agentes', () => {
  const store = openStore(':memory:');
  try {
    store.registerClaim({
      pid: 12345,
      label: 'feature-auth',
      agent: 'smith',
      scopes: ['src/auth/*', 'test/auth/*']
    });

    store.registerClaim({
      pid: 67890,
      label: 'feature-docs',
      agent: 'scribe',
      scopes: ['docs/*']
    });

    let claims = store.getActiveClaims();
    assert.equal(claims.length, 2);
    assert.equal(claims[0].pid, 12345);
    assert.deepEqual(claims[0].scopes, ['src/auth/*', 'test/auth/*']);

    // Libera 12345
    store.releaseClaim(12345);
    claims = store.getActiveClaims();
    assert.equal(claims.length, 1);
    assert.equal(claims[0].pid, 67890);

    // Limpeza de stale claims
    store.cleanStaleClaims(pid => pid === 99999); // 67890 is not alive
    claims = store.getActiveClaims();
    assert.equal(claims.length, 0);
  } finally {
    store.close();
  }
});

test('store: expoe OathboundStore como classe', () => {
  const store = new OathboundStore(':memory:');
  try {
    assert.equal(store.getStage('ausente'), null);
  } finally {
    store.close();
  }
});

test('store: transacao estruturada commita em sucesso', async () => {
  const store = openStore(':memory:');
  try {
    await store.transaction(s => {
      s.setStage('t1', 'etapa1');
      s.setStage('t2', 'etapa2');
    });
    assert.equal(store.getStage('t1'), 'etapa1');
    assert.equal(store.getStage('t2'), 'etapa2');
  } finally {
    store.close();
  }
});

test('store: transacao estruturada faz rollback em caso de erro', async () => {
  const store = openStore(':memory:');
  try {
    await assert.rejects(async () => {
      await store.transaction(async s => {
        s.setStage('t-rollback', 'deve-sumir');
        await Promise.resolve();
        throw Error('falha forcada');
      });
    }, /falha forcada/);
    assert.equal(store.getStage('t-rollback'), null);
  } finally {
    store.close();
  }
});

test('store: transacao aninhada rejeita e libera o estado apos o erro', async () => {
  const store = openStore(':memory:');
  try {
    await assert.rejects(
      store.transaction(async s => {
        await s.transaction(() => {});
      }),
      /transação aninhada/
    );
    await store.transaction(s => {
      s.setStage('t-apos-aninhada', 'ok');
    });
    assert.equal(store.getStage('t-apos-aninhada'), 'ok');
  } finally {
    store.close();
  }
});
