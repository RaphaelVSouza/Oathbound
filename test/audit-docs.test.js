const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { auditDocs } = require('../tools/audit-docs.core.js');

/** Helper to create an isolated workspace in os.tmpdir() */
function createTempWorkspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-test-audit-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return dir;
}

test('auditDocs: valida documentos corretos sem erros nem avisos', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Titulo\n\nVeja o [Guia](guia.md#introducao).\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'guia.md'), '# Guia\n\n## Introducao\n\nTexto do guia.\n', 'utf8');

  const config = {
    rootDocs: ['README.md', 'guia.md'],
    checks: { anchors: 'error', portability: 'error', outsideRepo: 'error' }
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 0);
  assert.equal(res.warnings.length, 0);
  assert.equal(res.stats.mdFiles, 2);
});

test('auditDocs: detecta link quebrado', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Titulo\n\nVeja o [Arquivo](arquivo-inexistente.md).\n', 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('link quebrado para: arquivo-inexistente.md'));
});

test('auditDocs: detecta âncora inexistente', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Titulo\n\nVeja [esta secao](#secao-fantasma).\n', 'utf8');

  const config = {
    rootDocs: ['README.md'],
    checks: { anchors: 'error' }
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('âncora inexistente em README.md: #secao-fantasma'));
});

test('auditDocs: proíbe referências a arquivo:linha em rootDocs', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Titulo\n\nConsulte o código em app.js:42 para detalhes.\n', 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('referência a arquivo:linha encontrada'));
});

test('auditDocs: detecta tabela com coluna de linhas preenchida', t => {
  const dir = createTempWorkspace(t);
  const tableContent = [
    '# Tabela',
    '',
    '| Arquivo | Linhas | Descrição |',
    '| --- | --- | --- |',
    '| index.js | 10-20 | Ponto de entrada |'
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'README.md'), tableContent, 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('coluna de linhas preenchida em tabela: 10-20'));
});

test('auditDocs: opera sobre source customizado in-memory (costura)', () => {
  const virtualFiles = {
    'DOC.md': Buffer.from('# Doc Virtual\n\nLink quebrado: [X](inexistente.md)\n')
  };

  const fakeSource = {
    label: 'virtual source',
    preload() {},
    exists(rel) { return rel in virtualFiles; },
    isDir() { return false; },
    isFile(rel) { return rel in virtualFiles; },
    exactCase(rel) { return { ok: true, actual: rel }; },
    list() { return []; },
    size(rel) { return virtualFiles[rel]?.length || 0; },
    read(rel) { return virtualFiles[rel]; }
  };

  const config = {
    rootDocs: ['DOC.md']
  };

  const res = auditDocs({
    repoRoot: '.',
    config,
    source: fakeSource
  });

  assert.equal(res.stats.sourceLabel, 'virtual source');
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('link quebrado para: inexistente.md'));
});
