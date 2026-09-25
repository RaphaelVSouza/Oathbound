const test = require('node:test');
const assert = require('node:assert/strict');
const { options, one, parseArgs } = require('../skill/scripts/cli-options');

test('options: faz parse de flags curtas e valores multiplos', () => {
  const parsed = options(['-d', 'repo', '-s', 'src/*', '-s', 'docs/*', '--', 'issue.md'], ['-d', '-s'], ['-R']);
  assert.deepEqual(parsed['-d'], ['repo']);
  assert.deepEqual(parsed['-s'], ['src/*', 'docs/*']);
  assert.deepEqual(parsed._, ['issue.md']);
  assert.equal(one(parsed, '-d'), 'repo');
  assert.equal(one(parsed, '-s'), 'docs/*');
  assert.equal(one(parsed, '-missing', 'default'), 'default');
});

test('options: faz parse de booleanos e flags longas', () => {
  const parsed = options(['--all', '--lines', '10'], ['--lines'], ['--all']);
  assert.equal(parsed['--all'], true);
  assert.deepEqual(parsed['--lines'], ['10']);
});

test('options: rejeita flag sem valor obrigatorio', () => {
  assert.throws(
    () => options(['-s'], ['-s']),
    /falta valor para/
  );
});

test('options: rejeita flag desconhecida', () => {
  assert.throws(
    () => options(['--inexistente'], ['-s']),
    /opção inválida/
  );
});
