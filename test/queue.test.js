const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { queue } = require('../skill/scripts/queue');
const { run } = require('../skill/scripts/process-runner.ts');

async function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-queue-'));
  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);
  return dir;
}

test('queue: valida presenca de argumentos obrigatorios (-d, -A, -s, issues)', async () => {
  await assert.rejects(
    () => queue([]),
    /uso: node queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
  await assert.rejects(
    () => queue(['-d', '.']),
    /uso: node queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
  await assert.rejects(
    () => queue(['-d', '.', '-A', 'arquivo-inexistente.txt', '-s', 'src/*']),
    /uso: node queue.js -d repo -A aceite.txt -s glob -- issue.md/
  );
});

test('queue: rejeita issue inexistente', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-queue-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios de aceite');

  await assert.rejects(
    () => queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/999.md']),
    /issue ausente: docs\/tickets\/999.md/
  );
});

test('queue: pula issue que ja consta como revisada (checkpoint)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-queue-cp-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  const ticket = path.join(ticketDir, '001.md');
  fs.writeFileSync(ticket, '# Ticket 001');

  // Set checkpoint as 'revisada' in git state dir
  const stateDir = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'docs-001'), 'revisada');

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/001.md']);
  assert.equal(code, 0);
});

test('queue G-009: rejeita diretorio como -A (aceite) com exit 2 antes de abrir sessao', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const acceptDir = path.join(dir, 'aceite-dir');
  fs.mkdirSync(acceptDir);

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '001.md'), '# Ticket 001');

  await assert.rejects(
    () => queue(['-d', dir, '-A', acceptDir, '-s', 'src/*', '--', 'docs/tickets/001.md']),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.message, /aceite.*arquivo|-A.*arquivo|não é um arquivo/i);
      return true;
    }
  );
});

test('queue G-009: rejeita diretorio como issue com exit 2 antes de abrir sessao', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios de aceite');

  const issueDir = path.join(dir, 'docs', 'tickets', '001');
  fs.mkdirSync(issueDir, { recursive: true });

  await assert.rejects(
    () => queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/001']),
    (err) => {
      assert.equal(err.code, 2);
      assert.match(err.message, /issue.*arquivo|não é um arquivo/i);
      return true;
    }
  );
});

test('queue G-010: -A relativo resolve contra a raiz do repo quando chamado de subdiretorio', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  fs.writeFileSync(path.join(dir, 'aceite.txt'), 'criterios de aceite (raiz)');
  const subDir = path.join(dir, 'sub');
  fs.mkdirSync(subDir);

  const stateDir = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'docs--tickets--001'), 'revisada');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '001.md'), '# Ticket 001');

  const prevCwd = process.cwd();
  process.chdir(subDir);
  t.after(() => process.chdir(prevCwd));
  try {
    const code = await queue(['-d', dir, '-A', 'aceite.txt', '-s', 'src/*', '--', 'docs/tickets/001.md']);
    assert.equal(code, 0, '-A relativo deve resolver contra a raiz do repo, não travar em cwd');
  } finally {
    process.chdir(prevCwd);
  }
});

test('queue G-010: -A relativo cai para cwd com aviso quando so existe la (compatibilidade)', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const subDir = path.join(dir, 'sub');
  fs.mkdirSync(subDir);
  // aceite só existe a partir do cwd (sub/aceite.txt), não existe dir/aceite.txt
  fs.writeFileSync(path.join(subDir, 'aceite.txt'), 'criterios de aceite (cwd)');

  const stateDir = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'docs--tickets--002'), 'revisada');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '002.md'), '# Ticket 002');

  const prevCwd = process.cwd();
  process.chdir(subDir);
  const stderrChunks = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { stderrChunks.push(String(chunk)); return originalWrite(chunk, ...rest); };
  t.after(() => { process.chdir(prevCwd); process.stderr.write = originalWrite; });
  try {
    const code = await queue(['-d', dir, '-A', 'aceite.txt', '-s', 'src/*', '--', 'docs/tickets/002.md']);
    assert.equal(code, 0, '-A deve cair para cwd quando só existe lá');
    assert.match(stderrChunks.join(''), /removid[oa]|depreciad|será removido/i, 'deve avisar em stderr sobre remoção futura do fallback pro cwd');
  } finally {
    process.chdir(prevCwd);
    process.stderr.write = originalWrite;
  }
});

test('queue: processa issue com runner emitindo saida estruturada JSONL sem falhar no reviewer (codigo 6)', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-test-queue-codex-'));
  t.after(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  });

  await run('git', ['-C', dir, 'init']);
  await run('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await run('git', ['-C', dir, 'config', 'user.name', 'Test']);

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios de aceite');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  const ticket = path.join(ticketDir, '002.md');
  fs.writeFileSync(ticket, '# Ticket 002: Implementar feature');

  const mockRunnerPath = path.join(dir, 'mock-codex-runner.js');
  const codexScript = `
    const codex = require(${JSON.stringify(path.resolve(__dirname, '../skill/scripts/runners/codex.ts'))}).adapter;
    module.exports = {
      name: 'mock-codex',
      resolveAgentFile: () => '',
      prepareAgent: () => ({ promptPrefix: '' }),
      buildCommand({ agent }) {
        if (agent === 'assayer') {
          const s = [
            'console.log(JSON.stringify({ type: "thread.started", thread_id: "th-rev-999" }));',
            'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "No issues." } }));'
          ].join('\\n');
          return { command: 'node', args: ['-e', s] };
        }
        const s = [
          'const fs = require("node:fs");',
          'fs.mkdirSync("src", { recursive: true });',
          'fs.writeFileSync("src/feature.js", "export const ok = true;\\\\n");',
          'console.log(JSON.stringify({ type: "thread.started", thread_id: "th-run-111" }));',
          'console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "ACEITE: feature implementada" } }));'
        ].join('\\n');
        return { command: 'node', args: ['-e', s] };
      },
      parseOutput: codex.parseOutput,
      resolveSession: codex.resolveSession
    };
  `;
  fs.writeFileSync(mockRunnerPath, codexScript, 'utf8');

  const code = await queue([
    '-d', dir,
    '-A', accept,
    '-s', 'src/*',
    '-u', mockRunnerPath,
    '--',
    'docs/tickets/002.md'
  ]);

  assert.equal(code, 0, 'fila deve concluir com sucesso (codigo 0) e casar recibo No issues. do reviewer');

  const stateDir = path.join(dir, '.git', 'oathbound', 'state');
  const stage = fs.readFileSync(path.join(stateDir, 'docs--tickets--002'), 'utf8').trim();
  assert.equal(stage, 'revisada', 'estagio final deve ser revisada (id novo: caminho relativo com --)');
});

test('queue G-012: checkpoint gravado no esquema antigo de id continua reconhecido (migracao)', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');

  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '003.md'), '# Ticket 003');

  const stateDirPath = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDirPath, { recursive: true });
  fs.writeFileSync(path.join(stateDirPath, 'docs-003'), 'revisada');

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '--', 'docs/tickets/003.md']);
  assert.equal(code, 0, 'checkpoint legado deve ser migrado e a issue pulada como já revisada');

  const newMarker = path.join(stateDirPath, 'docs--tickets--003');
  assert.equal(fs.readFileSync(newMarker, 'utf8').trim(), 'revisada', 'marker novo deve existir apos migracao');
});

function withGenericFixture(t, { reply, writeFile, writeContent } = {}) {
  const fixture = path.resolve(__dirname, 'fixtures', 'generic-runner.js');
  const logPath = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-fixture-log-')) + path.sep + 'calls.log';
  const prevGenericCmd = process.env.OATHBOUND_GENERIC_CMD;
  const prevReply = process.env.OATHBOUND_FIXTURE_REPLY;
  const prevLog = process.env.OATHBOUND_FIXTURE_LOG;
  const prevWriteFile = process.env.OATHBOUND_FIXTURE_WRITE_FILE;
  const prevWriteContent = process.env.OATHBOUND_FIXTURE_WRITE_CONTENT;
  process.env.OATHBOUND_GENERIC_CMD = `node ${fixture}`;
  process.env.OATHBOUND_FIXTURE_REPLY = reply ?? 'ACEITE: ok';
  process.env.OATHBOUND_FIXTURE_LOG = logPath;
  if (writeFile) process.env.OATHBOUND_FIXTURE_WRITE_FILE = writeFile; else delete process.env.OATHBOUND_FIXTURE_WRITE_FILE;
  if (writeContent) process.env.OATHBOUND_FIXTURE_WRITE_CONTENT = writeContent; else delete process.env.OATHBOUND_FIXTURE_WRITE_CONTENT;
  t.after(() => {
    if (prevGenericCmd === undefined) delete process.env.OATHBOUND_GENERIC_CMD; else process.env.OATHBOUND_GENERIC_CMD = prevGenericCmd;
    if (prevReply === undefined) delete process.env.OATHBOUND_FIXTURE_REPLY; else process.env.OATHBOUND_FIXTURE_REPLY = prevReply;
    if (prevLog === undefined) delete process.env.OATHBOUND_FIXTURE_LOG; else process.env.OATHBOUND_FIXTURE_LOG = prevLog;
    if (prevWriteFile === undefined) delete process.env.OATHBOUND_FIXTURE_WRITE_FILE; else process.env.OATHBOUND_FIXTURE_WRITE_FILE = prevWriteFile;
    if (prevWriteContent === undefined) delete process.env.OATHBOUND_FIXTURE_WRITE_CONTENT; else process.env.OATHBOUND_FIXTURE_WRITE_CONTENT = prevWriteContent;
  });
  return { logPath };
}

test('queue G-002: aceita "No issues." normalizado (variantes de formatacao)', async (t) => {
  const variants = [
    'No issues.',
    '`No issues.`',
    '**No issues.**',
    '```\nNo issues.\n```'
  ];
  for (const variant of variants) {
    const dir = await initRepo();
    t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
    const accept = path.join(dir, 'aceite.txt');
    fs.writeFileSync(accept, 'criterios');
    const ticketDir = path.join(dir, 'docs', 'tickets');
    fs.mkdirSync(ticketDir, { recursive: true });
    fs.writeFileSync(path.join(ticketDir, '004.md'), '# Ticket 004');

    // Pula a implementação via checkpoint 'implementada' pra ir direto pro reviewer; cria o
    // arquivo no escopo manualmente (a implementação real não roda) pra ter diff não vazio.
    const stateDirPath = path.join(dir, '.git', 'oathbound', 'state');
    fs.mkdirSync(stateDirPath, { recursive: true });
    fs.writeFileSync(path.join(stateDirPath, 'docs--tickets--004'), 'implementada');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'feature.js'), 'export const ok = true;\n');

    withGenericFixture(t, { reply: variant });
    const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/004.md']);
    assert.equal(code, 0, `variante deveria ser aceita: ${JSON.stringify(variant)}`);
  }
});

test('queue G-002: texto sem recibo reconhecivel continua parando com exit 6', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');
  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '005.md'), '# Ticket 005');

  const stateDirPath = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDirPath, { recursive: true });
  fs.writeFileSync(path.join(stateDirPath, 'docs--tickets--005'), 'implementada');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'feature.js'), 'export const ok = true;\n');

  withGenericFixture(t, { reply: 'tudo certo por aqui, sem comentarios adicionais' });
  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/005.md']);
  assert.equal(code, 6, 'sem recibo reconhecivel deve continuar parando com exit 6');
});

test('queue G-012: issues que colidiam no esquema antigo (a/x/001.md e a/y/001.md) agora tem ids distintos', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');

  fs.mkdirSync(path.join(dir, 'a', 'x'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'a', 'y'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a', 'x', '001.md'), '# Issue X');
  fs.writeFileSync(path.join(dir, 'a', 'y', '001.md'), '# Issue Y');

  // Marca só a primeira (id novo) como revisada; a segunda deve ainda ser processada
  // (não pulada por colisão) — o que importa é que ids gerados internamente não colidam.
  const stateDirPath = path.join(dir, '.git', 'oathbound', 'state');
  fs.mkdirSync(stateDirPath, { recursive: true });
  fs.writeFileSync(path.join(stateDirPath, 'a--x--001'), 'revisada');

  withGenericFixture(t, {
    reply: 'No issues.',
    writeFile: path.join(dir, 'src', 'feature.js'),
    writeContent: 'export const ok = true;\n'
  });
  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'a/x/001.md', 'a/y/001.md']);
  // a/x/001.md pula (checkpoint) e não gera marker novo; a/y/001.md não tem checkpoint,
  // roda de ponta a ponta com o runner mockado e deve concluir sem colidir com o id de a/x/001.
  assert.equal(code, 0, 'a/y/001.md não tem checkpoint; não deve ser pulada por colisão de id com a/x/001.md');
  const markerY = path.join(stateDirPath, 'a--y--001');
  assert.ok(fs.existsSync(markerY), 'a/y/001.md deveria gerar seu próprio marker de estado, distinto de a/x/001');
});

test('queue G-013: exit 3 (fora do escopo) para a fila, lista arquivos e nao marca implementada', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');
  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '006.md'), '# Ticket 006');

  // Fixture (runner de implementacao) escreve um arquivo FORA do escopo declarado (-s src/*),
  // simulando uma edicao fora do escopo que o run.js detecta e sintetiza como exit 3.
  withGenericFixture(t, { writeFile: path.join(dir, 'other', 'arquivo.txt'), writeContent: 'fora do escopo' });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  let code;
  try {
    code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/006.md']);
  } finally {
    console.log = origLog;
  }

  assert.equal(code, 3, 'edicao fora do escopo deve parar a fila com exit 3');
  const output = logs.join('\n');
  assert.match(output, /fora do escopo/i, 'deve listar os arquivos fora do escopo declarado');
  assert.match(output, /other[\\/]arquivo\.txt/, 'deve nomear o arquivo fora do escopo');

  const marker = path.join(dir, '.git', 'oathbound', 'state', 'docs--tickets--006');
  assert.ok(!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== 'implementada',
    'nao deve marcar a issue como implementada quando a fila para por exit 3');
});

test('queue G-003: reviewer recebe o diff real (nao so a issue)', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');
  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '007.md'), '# Ticket 007');

  // Fixture (runner de implementacao) cria um arquivo novo no escopo -s src/*; o hunk
  // desse arquivo deve aparecer na mensagem recebida pelo reviewer.
  const { logPath } = withGenericFixture(t, {
    reply: 'No issues.',
    writeFile: path.join(dir, 'src', 'feature.js'),
    writeContent: 'export const marcaUnica123 = true;\n'
  });

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/007.md']);
  assert.equal(code, 0, 'fila deve concluir com sucesso');

  const calls = fs.readFileSync(logPath, 'utf8').split('\n---\n').filter(Boolean);
  assert.equal(calls.length, 2, 'runner de implementacao e reviewer devem ter sido chamados uma vez cada');
  const reviewerMessage = calls[1];
  assert.match(reviewerMessage, /marcaUnica123/, 'mensagem do reviewer deve conter o conteudo do diff real, nao so a issue');

  const diffFile = path.join(dir, '.git', 'oathbound', 'review', 'docs--tickets--007.diff');
  assert.ok(fs.existsSync(diffFile), 'diff completo deve ser salvo em arquivo .diff');
  assert.match(fs.readFileSync(diffFile, 'utf8'), /marcaUnica123/);
});

test('queue G-003: diff grande e truncado no prompt mas arquivo .diff tem a integra', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');
  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '008.md'), '# Ticket 008');

  const bigContent = 'x'.repeat(30000) + '\nmarcaFinal456\n';
  const { logPath } = withGenericFixture(t, {
    reply: 'No issues.',
    writeFile: path.join(dir, 'src', 'grande.js'),
    writeContent: bigContent
  });

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/008.md']);
  assert.equal(code, 0);

  const calls = fs.readFileSync(logPath, 'utf8').split('\n---\n').filter(Boolean);
  const reviewerMessage = calls[1];
  assert.match(reviewerMessage, /truncado/, 'prompt deve avisar que o diff foi truncado');
  assert.doesNotMatch(reviewerMessage, /marcaFinal456/, 'conteudo apos o limite nao deve estar embutido no prompt');

  const diffFile = path.join(dir, '.git', 'oathbound', 'review', 'docs--tickets--008.diff');
  assert.match(fs.readFileSync(diffFile, 'utf8'), /marcaFinal456/, 'arquivo .diff deve ter a integra, sem truncar');
});

test('queue G-003: diff vazio no escopo para com exit 6 sem chamar o reviewer', async (t) => {
  const dir = await initRepo();
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  const accept = path.join(dir, 'aceite.txt');
  fs.writeFileSync(accept, 'criterios');
  const ticketDir = path.join(dir, 'docs', 'tickets');
  fs.mkdirSync(ticketDir, { recursive: true });
  fs.writeFileSync(path.join(ticketDir, '009.md'), '# Ticket 009');

  // Runner de implementacao nao escreve nada no escopo -s src/* (fixture sem writeFile).
  const { logPath } = withGenericFixture(t, {});

  const code = await queue(['-d', dir, '-A', accept, '-s', 'src/*', '-u', 'generic', '--', 'docs/tickets/009.md']);
  assert.equal(code, 6, 'diff vazio no escopo deve parar a fila com exit 6');

  const calls = fs.readFileSync(logPath, 'utf8').split('\n---\n').filter(Boolean);
  assert.equal(calls.length, 1, 'reviewer nao deve ser chamado quando o diff do escopo esta vazio');
});

