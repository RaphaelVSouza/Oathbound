'use strict';
// Teste da trilha de auditoria. Rode: node test/hooks/agent-audit.test.js
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
process.env.AGENT_AUDIT_DIR = dir;
const { registrar } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'agent-audit.js'));
const arquivo = path.join(dir, 'agent-audit.jsonl');
const ler = () => fs.readFileSync(arquivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

try {
  // Sem agent_id (sessão principal): não grava.
  assert.strictEqual(registrar({ tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
  assert.ok(!fs.existsSync(arquivo), 'sessão principal não deve gravar');

  // Subagente: grava campos esperados.
  assert.strictEqual(registrar({
    agent_id: 'abc', agent_type: 'assayer', session_id: '12345678-aaaa',
    tool_name: 'Bash', tool_use_id: 'tool-1', tool_input: { command: 'fixture secreta' },
  }), true);
  let l = ler()[0];
  assert.strictEqual(l.agente, 'assayer');
  assert.strictEqual(l.ferramenta, 'Bash');
  assert.strictEqual(l.tool_use_id, 'tool-1');
  assert.ok(!('alvo' in l));
  assert.ok(!fs.readFileSync(arquivo, 'utf8').includes('fixture secreta'));
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(arquivo).mode & 0o777, 0o600);
  assert.strictEqual(l.sessao, '12345678');
  assert.ok(l.ts);

  // Bloqueio carrega flag e motivo.
  registrar({ agent_id: 'abc', agent_type: 'sentinel', tool_name: 'Bash', tool_input: { command: 'touch x' } },
    { bloqueado: true, motivo: 'somente_leitura' });
  l = ler()[1];
  assert.strictEqual(l.bloqueado, true);
  assert.strictEqual(l.motivo, 'somente_leitura');

  // Conteúdo de arquivo nunca é gravado.
  registrar({ agent_id: 'abc', agent_type: 'smith', tool_name: 'Write',
    tool_input: { file_path: 'a.txt', content: 'CONTEUDO-SECRETO-NAO-GRAVAR' } });
  assert.ok(!fs.readFileSync(arquivo, 'utf8').includes('CONTEUDO-SECRETO-NAO-GRAVAR'));
  assert.ok(!('alvo' in ler()[2]));

  for (const [tool_name, tool_input] of [
    ['Grep', { pattern: 'consulta fictícia' }],
    ['WebSearch', { query: 'consulta fictícia' }],
    ['WebFetch', { url: 'https://example.com/consulta fictícia' }],
  ]) {
    registrar({ agent_id: 'abc', tool_name, tool_input },
      { bloqueado: true, motivo: 'consulta fictícia', alvo: 'consulta fictícia' });
  }
  assert.ok(!fs.readFileSync(arquivo, 'utf8').includes('consulta fictícia'));

  // Rotação acima de 1 MB.
  fs.writeFileSync(arquivo, 'x'.repeat(1024 * 1024 + 1));
  registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'b' } });
  assert.ok(fs.existsSync(`${arquivo}.1`), 'rotação deve criar .1');
  assert.strictEqual(ler().length, 1);

  // Segunda rotação: .1 vira .2 e o .2 antigo é descartado; no máximo 3 arquivos.
  fs.writeFileSync(`${arquivo}.1`, 'GERACAO-1');
  fs.writeFileSync(`${arquivo}.2`, 'GERACAO-2-ANTIGA');
  fs.writeFileSync(arquivo, 'x'.repeat(1024 * 1024 + 1));
  registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'c' } });
  assert.strictEqual(fs.readFileSync(`${arquivo}.2`, 'utf8'), 'GERACAO-1');
  assert.ok(fs.readFileSync(`${arquivo}.1`, 'utf8').startsWith('xxx'));
  assert.ok(!fs.existsSync(`${arquivo}.3`));
  assert.ok(!fs.existsSync(`${arquivo}.lock`), 'trava deve ser removida');

  // Trava abandonada (mais de 5 s): é removida e a rotação acontece.
  fs.writeFileSync(arquivo, 'x'.repeat(1024 * 1024 + 1));
  fs.writeFileSync(`${arquivo}.1`, 'ANTES-DA-TRAVA-VELHA');
  fs.writeFileSync(`${arquivo}.lock`, '');
  const velha = new Date(Date.now() - 60000);
  fs.utimesSync(`${arquivo}.lock`, velha, velha);
  registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'v' } });
  assert.strictEqual(fs.readFileSync(`${arquivo}.2`, 'utf8'), 'ANTES-DA-TRAVA-VELHA', 'trava velha não deve impedir a rotação');
  assert.ok(!fs.existsSync(`${arquivo}.lock`));

  // Rename que falha (.2 é pasta não vazia): aborta sem mover nada e ainda grava a linha.
  fs.rmSync(`${arquivo}.2`, { force: true });
  fs.mkdirSync(`${arquivo}.2`);
  fs.writeFileSync(path.join(`${arquivo}.2`, 'x'), 'x');
  fs.writeFileSync(`${arquivo}.1`, 'GERACAO-1-INTACTA');
  fs.writeFileSync(arquivo, 'x'.repeat(1024 * 1024 + 1));
  assert.strictEqual(registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'f' } }), true);
  assert.strictEqual(fs.readFileSync(`${arquivo}.1`, 'utf8'), 'GERACAO-1-INTACTA', 'rotação abortada não pode sobrescrever .1');
  assert.ok(fs.statSync(arquivo).size > 1024 * 1024, 'arquivo ativo segue intacto');
  assert.ok(!fs.existsSync(`${arquivo}.lock`));
  fs.rmSync(`${arquivo}.2`, { recursive: true, force: true });
  fs.writeFileSync(arquivo, '');

  // Trava recente de outra instância: pula a rotação, mas ainda grava a linha.
  fs.writeFileSync(arquivo, 'x'.repeat(1024 * 1024 + 1));
  fs.writeFileSync(`${arquivo}.lock`, '');
  fs.writeFileSync(`${arquivo}.2`, 'ESTADO-ANTES');
  const antes =fs.readFileSync(`${arquivo}.2`, 'utf8');
  assert.strictEqual(registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'd' } }), true);
  assert.strictEqual(fs.readFileSync(`${arquivo}.2`, 'utf8'), antes, 'não rotaciona com trava ativa');
  fs.unlinkSync(`${arquivo}.lock`);
  fs.writeFileSync(arquivo, '');

  // Ponto de entrada por stdin: vazio, malformado e válido; sem stdout, exit 0.
  const { spawnSync } = require('child_process');
  const rodar = (entrada) => spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'claude', 'hooks', 'agent-audit.js')],
    { input: entrada, encoding: 'utf8', env: { ...process.env, AGENT_AUDIT_DIR: dir } });
  for (const entrada of ['', '{nao json', 'null', '{"tool_name":"Bash"}']) {
    const r = rodar(entrada);
    assert.strictEqual(r.status, 0, `exit ${r.status} com entrada ${JSON.stringify(entrada)}`);
    assert.strictEqual(r.stdout, '');
  }
  assert.strictEqual(fs.readFileSync(arquivo, 'utf8'), '', 'entrada sem agent_id não grava');
  const rv = rodar(JSON.stringify({ agent_id: 'z', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'e' } }));
  assert.strictEqual(rv.status, 0);
  assert.strictEqual(rv.stdout, '');
  assert.strictEqual(ler().pop().ferramenta, 'Read');

  // Payload ilegível mas com agent_id: não some da trilha; grava linha com erro, sem conteúdo.
  fs.writeFileSync(arquivo, '');
  const corrompido = '{"agent_id":"w","agent_type":"smith","session_id":"abcdef123456","tool_name":"Write","tool_input":{"content":"CONTEUDO-SECRETO-X' ;
  const rc = rodar(corrompido);
  assert.strictEqual(rc.status, 0);
  assert.strictEqual(rc.stdout, '');
  const lc = ler().pop();
  assert.strictEqual(lc.agent_id, 'w');
  assert.strictEqual(lc.ferramenta, 'Write');
  assert.strictEqual(lc.erro, 'payload_invalido');
  assert.ok(!fs.readFileSync(arquivo, 'utf8').includes('CONTEUDO-SECRETO-X'));
  // Sem agent_id (sessão principal) e ilegível: não grava.
  fs.writeFileSync(arquivo, '');
  rodar('{"tool_name":"Bash","tool_input":{"command":"ls');
  assert.strictEqual(fs.readFileSync(arquivo, 'utf8'), '');
  // registrarFalha direto: payload grande e stdin lento usam o mesmo caminho.
  const { registrarFalha } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'agent-audit.js'));
  assert.strictEqual(registrarFalha('{"agent_id":"g","tool_name":"Bash"', 'payload_grande'), true);
  assert.strictEqual(ler().pop().erro, 'payload_grande');
  assert.strictEqual(registrarFalha('sem identificador', 'stdin_lento'), false);
  fs.writeFileSync(arquivo, '');

  // Falha de gravação nunca lança.
  process.env.AGENT_AUDIT_DIR = path.join(arquivo, 'invalido');
  assert.strictEqual(registrar({ agent_id: 'abc', tool_name: 'Bash', tool_input: { command: 'ls' } }), false);

  console.log('ok: auditoria');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
