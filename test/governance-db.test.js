const test = require('node:test');
const assert = require('node:assert/strict');
const { GovernanceStore, openGovernanceStore, isSqliteAvailable } = require('../skill/scripts/governance-db');

test('governance-db: verifica disponibilidade de node:sqlite no Node 22+', () => {
  assert.equal(isSqliteAvailable(), true);
});

test('governance-db: grava e recupera estagio da fila', () => {
  const store = openGovernanceStore(':memory:');
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

test('governance-db: registra, recupera e libera claims de agentes', () => {
  const store = openGovernanceStore(':memory:');
  try {
    store.registerClaim({
      pid: 12345,
      label: 'feature-auth',
      agent: 'ds-runner',
      scopes: ['src/auth/*', 'test/auth/*']
    });

    store.registerClaim({
      pid: 67890,
      label: 'feature-docs',
      agent: 'ds-governance',
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
