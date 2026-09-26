const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, alive, resolveCommand } = require('../skill/scripts/process-runner.ts');

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

test('run: reconstroi caractere UTF-8 dividido entre dois writes de stdout', async () => {
  const script = `
    const b = Buffer.from('ação');
    process.stdout.write(b.subarray(0, 2));
    setTimeout(() => process.stdout.write(b.subarray(2)), 50);
  `;
  const r = await run('node', ['-e', script]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'ação');
});

test('alive: detecta processos vivos e descarta invalidos', () => {
  assert.equal(alive(process.pid), true);
  assert.equal(alive(-1), false);
  assert.equal(alive(0), false);
  assert.equal(alive('invalido'), false);
  assert.equal(alive(99999999), false);
});

// Shim no formato gerado pelo npm (cmd-shim) para um pacote com bin Node.
function npmShim(rel) {
  return [
    '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
    'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"',
    '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${rel}" %*`, ''
  ].join('\r\n');
}

function shimDir(t, binName = 'fakecli') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-shim-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const script = path.join(dir, 'node_modules', 'fake-cli', 'bin', binName);
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  fs.writeFileSync(path.join(dir, `${binName}.cmd`), npmShim(`node_modules\\fake-cli\\bin\\${binName}`));
  return { dir, script };
}

test('resolveCommand: fora do Windows devolve o comando intacto', () => {
  assert.deepEqual(resolveCommand('opencode', { platform: 'linux', env: {} }), { command: 'opencode', prefix: [] });
});

test('resolveCommand: shim npm .cmd vira node + script alvo', t => {
  const { dir, script } = shimDir(t);
  const r = resolveCommand('fakecli', { platform: 'win32', env: { Path: `"${dir}";C:\\inexistente` } });
  assert.deepEqual(r, { command: process.execPath, prefix: [script] });
});

test('resolveCommand: .exe no PATH tem prioridade sobre .cmd', t => {
  const { dir } = shimDir(t);
  fs.writeFileSync(path.join(dir, 'fakecli.exe'), '');
  assert.deepEqual(resolveCommand('fakecli', { platform: 'win32', env: { PATH: dir } }), { command: path.join(dir, 'fakecli.exe'), prefix: [] });
});

test('resolveCommand: localiza .exe explicito pelo PATH', t => {
  const { dir } = shimDir(t);
  const executable = path.join(dir, 'opencode.exe');
  fs.writeFileSync(executable, '');
  assert.deepEqual(resolveCommand('opencode.exe', { platform: 'win32', env: { PATH: dir } }), { command: executable, prefix: [] });
});

test('resolveCommand: shim que aponta para .exe executa o binario direto', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-shim-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'real.exe'), '');
  fs.writeFileSync(path.join(dir, 'tool.cmd'), '@"%~dp0\\bin\\real.exe" %*\r\n');
  assert.deepEqual(resolveCommand('tool', { platform: 'win32', env: { PATH: dir } }), { command: path.join(dir, 'bin', 'real.exe'), prefix: [] });
});

test('resolveCommand: .cmd sem formato de shim falha sem recorrer a shell', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-shim-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'tool.cmd'), '@echo off\r\nnode "%~dp0\\x.js" %1 %2\r\n');
  assert.throws(() => resolveCommand('tool', { platform: 'win32', env: { PATH: dir } }), /não é um shim npm reconhecível/);
});

test('resolveCommand: shim apontando para arquivo ausente falha com o caminho', t => {
  const { dir, script } = shimDir(t);
  fs.rmSync(script);
  assert.throws(() => resolveCommand('fakecli', { platform: 'win32', env: { PATH: dir } }), /arquivo ausente/);
});

test('resolveCommand: comando inexistente no PATH segue para o spawn como hoje', () => {
  assert.deepEqual(resolveCommand('nada-aqui', { platform: 'win32', env: { PATH: '' } }), { command: 'nada-aqui', prefix: [] });
});

test('run: executa shim npm .cmd no Windows sem shell e preserva argumentos', { skip: process.platform !== 'win32' }, async t => {
  const { dir } = shimDir(t);
  const args = ['a&b', 'x|y', 'aspas "internas"', '%PATH%', 'fim^', 'com espaço'];
  const pathKey = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const env = { ...process.env, [pathKey]: `${dir};${process.env[pathKey] || ''}` };
  const r = await run('fakecli', args, { env });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), args);
});
