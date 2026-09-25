const test = require('node:test');
const assert = require('node:assert/strict');
const { run, alive } = require('../skill/scripts/process-runner');

test('run: executa processo com sucesso e captura stdout', async () => {
  const r = await run('node', ['-e', 'console.log("teste de execucao")']);
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes('teste de execucao'));
  assert.equal(r.stderr, '');
});

test('run: captura stderr e preserva codigo de saida com falha', async () => {
  const r = await run('node', ['-e', 'console.error("mensagem de erro"); process.exit(42)']);
  assert.equal(r.code, 42);
  assert.ok(r.stderr.includes('mensagem de erro'));
});

test('run: encerra arvore por timeout e retorna codigo 124', async () => {
  const started = Date.now();
  const r = await run('node', ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 1 });
  const elapsed = (Date.now() - started) / 1000;

  assert.equal(r.code, 124);
  assert.ok(elapsed < 10, 'deve encerrar proximo do limite de 1s');
});

test('run: envia input para o processo via stdin', async () => {
  const script = 'let d = ""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => console.log("RECEBIDO:" + d));';
  const r = await run('node', ['-e', script], { input: 'conteudo-de-teste' });
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes('RECEBIDO:conteudo-de-teste'));
});

test('alive: detecta processos vivos e descarta invalidos', () => {
  assert.equal(alive(process.pid), true);
  assert.equal(alive(-1), false);
  assert.equal(alive(0), false);
  assert.equal(alive('invalido'), false);
  assert.equal(alive(99999999), false);
});
