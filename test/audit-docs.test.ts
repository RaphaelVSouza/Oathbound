const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { auditDocs } = require('../tools/audit-docs.core.ts');

/** Helper to create an isolated workspace in os.tmpdir() */
function createTempWorkspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-audit-'));
  t.after(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
  return dir;
}

test('auditDocs: validates correct documents without errors or warnings', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n\nSee the [Guide](guia.md#introduction).\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'guia.md'), '# Guide\n\n## Introduction\n\nGuide text.\n', 'utf8');

  const config = {
    rootDocs: ['README.md', 'guia.md'],
    checks: { anchors: 'error', portability: 'error', outsideRepo: 'error' }
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 0);
  assert.equal(res.warnings.length, 0);
  assert.equal(res.stats.mdFiles, 2);
});

test('auditDocs: detects broken links', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n\nSee the [File](arquivo-inexistente.md).\n', 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('broken link to: arquivo-inexistente.md'));
});

test('auditDocs: detects missing anchors', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n\nSee [this section](#secao-fantasma).\n', 'utf8');

  const config = {
    rootDocs: ['README.md'],
    checks: { anchors: 'error' }
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('missing anchor in README.md: #secao-fantasma'));
});

test('auditDocs: forbids file:line references in rootDocs', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Title\n\nSee code in app.js:42 for details.\n', 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('file:line reference found'));
});

test('auditDocs: detects tables with populated line columns', t => {
  const dir = createTempWorkspace(t);
  const tableContent = [
    '# Table',
    '',
    '| File | Lines | Description |',
    '| --- | --- | --- |',
    '| index.js | 10-20 | Entry point |'
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'README.md'), tableContent, 'utf8');

  const config = {
    rootDocs: ['README.md']
  };

  const res = auditDocs({ repoRoot: dir, config });
  assert.equal(res.errors.length, 1);
  assert.ok(res.errors[0].includes('populated line column in table: 10-20'));
});

test('auditDocs: works with a custom in-memory source (seam)', () => {
  const virtualFiles = {
    'DOC.md': Buffer.from('# Virtual Doc\n\nBroken link: [X](inexistente.md)\n')
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
  assert.ok(res.errors[0].includes('broken link to: inexistente.md'));
});

test('auditDocs: rejects retired terms only in configured active documents', t => {
  const dir = createTempWorkspace(t);
  fs.writeFileSync(path.join(dir, 'README.md'), '# History\n\nThe former mimic was replaced.\n');
  fs.mkdirSync(path.join(dir, 'guild'));
  fs.writeFileSync(path.join(dir, 'guild', 'paladino.md'), '# Paladino\n\nmimic\n');
  const result = auditDocs({
    repoRoot: dir,
    config: {
      rootDocs: ['README.md'],
      docs: [{ path: 'guild', recursive: true, lineNumberRefs: 'allow' }],
      forbiddenTerms: { paths: ['guild/**'], terms: ['mimic'] }
    }
  });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /guild\/paladino\.md.*retired term/);
});
