'use strict';
// Teste da trilha de auditoria. Rode: node test/hooks/agent-audit.test.js
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
process.env.AGENT_AUDIT_DIR = dir;
const { registrar, resumir, redigir } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'agent-audit.js'));
const arquivo = path.join(dir, 'agent-audit.jsonl');
const ler = () => fs.readFileSync(arquivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

try {
  // Sem agent_id (sessão principal): não grava.
  assert.strictEqual(registrar({ tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
  assert.ok(!fs.existsSync(arquivo), 'sessão principal não deve gravar');

  // Subagente: grava campos esperados.
  assert.strictEqual(registrar({
    agent_id: 'abc', agent_type: 'assayer', session_id: '12345678-aaaa',
    tool_name: 'Bash', tool_input: { command: 'git log -n 1' },
  }), true);
  let l = ler()[0];
  assert.strictEqual(l.agente, 'assayer');
  assert.strictEqual(l.ferramenta, 'Bash');
  assert.strictEqual(l.alvo, 'git log -n 1');
  assert.strictEqual(l.sessao, '12345678');
  assert.ok(l.ts);

  // Bloqueio carrega flag e motivo.
  registrar({ agent_id: 'abc', agent_type: 'sentinel', tool_name: 'Bash', tool_input: { command: 'touch x' } },
    { bloqueado: true, motivo: 'comando fora da lista' });
  l = ler()[1];
  assert.strictEqual(l.bloqueado, true);
  assert.strictEqual(l.motivo, 'comando fora da lista');

  // Conteúdo de arquivo nunca é gravado.
  registrar({ agent_id: 'abc', agent_type: 'smith', tool_name: 'Write',
    tool_input: { file_path: 'a.txt', content: 'CONTEUDO-SECRETO-NAO-GRAVAR' } });
  assert.ok(!fs.readFileSync(arquivo, 'utf8').includes('CONTEUDO-SECRETO-NAO-GRAVAR'));
  assert.strictEqual(ler()[2].alvo, 'a.txt');

  // Redação de segredos.
  assert.ok(!redigir('GEMINI_API_KEY=valor123abc').includes('valor123abc'));
  assert.ok(!redigir('curl -H "Authorization: Bearer abcdefgh12345678"').includes('abcdefgh12345678'));
  assert.ok(!redigir('x sk-abcdefghijklmnop1234 y').includes('abcdefghijklmnop1234'));
  assert.ok(!redigir('token: ghp_abcdefghijklmnopqrstuvwx').includes('ghp_abcdefghijklmnopqrstuvwx'));
  assert.ok(redigir('git log -n 1').includes('git log -n 1'));

  // Formas que vazavam (auditoria Opus): aspas, flag com espaço, valor com espaço, outros formatos.
  const casos = [
    ['{"api_key": "SEGREDO1"}', 'SEGREDO1'],
    ["{'password': 'SEGREDO2'}", 'SEGREDO2'],
    ['run --token SEGREDO3 --x', 'SEGREDO3'],
    ['run --password SEGREDO4', 'SEGREDO4'],
    ['run --api-key "SEG RETO5 B"', 'RETO5'],
    ['PASSWORD="seg reto6 parte"', 'parte'],
    ['STRIPE=sk_live_abcdefghijklmnop1234', 'abcdefghijklmnop1234'],
    ['x github_pat_abcdefghijklmnopqrstuv1234 y', 'abcdefghijklmnopqrstuv1234'],
    ['glpat-abcdefghijklmnopqrst', 'abcdefghijklmnopqrst'],
    ['xoxb-1234567890-abcdefghij', '1234567890-abcdefghij'],
    ['id ASIAABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0'],
    ['curl -H "Authorization: Basic dXNlcjpwYXNzd29yZA=="', 'dXNlcjpwYXNzd29yZA'],
    ['curl -u admin:SEGREDO7 https://x.com', 'SEGREDO7'],
    ['git clone https://usuario:SEGREDO8@host.com/r.git', 'SEGREDO8'],
    ['git clone https://TOKEN9ABC@host.com/r.git', 'TOKEN9ABC'],
    ['mysql -h db -u root -pSEGREDO10 base', 'SEGREDO10'],
    ['sshpass -p SEGREDO11 ssh h', 'SEGREDO11'],
    // Segunda rodada (auditoria sentinel): JSON escapado, cabeçalhos, nomes e prefixos novos.
    ['curl -d "{\\"password\\":\\"hunter2xyz\\"}" http://x', 'hunter2xyz'],
    ['curl -H "Authorization: Token SEGREDO13" http://x', 'SEGREDO13'],
    ['curl -H "Cookie: sid=SEGREDO14; a=b" http://x', 'SEGREDO14'],
    ['gpg --passphrase SEGREDO15 -d f', 'SEGREDO15'],
    ['openssl enc -passin pass:SEGREDO16 -in f', 'SEGREDO16'],
    ['get "u?X-Amz-Signature=SEGREDO17"', 'SEGREDO17'],
    ['DB_DSN=postgres-SEGREDO18', 'SEGREDO18'],
    ['t ya29.abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvwxyz'],
    ['t npm_abcdefghijklmnopqrstuvwxyz1234', 'abcdefghijklmnopqrstuvwxyz1234'],
    ['t hf_abcdefghijklmnopqrstuvwxyz1234', 'abcdefghijklmnopqrstuvwxyz1234'],
    ['t shpat_0123456789abcdef0123', '0123456789abcdef0123'],
    ['t dop_v1_0123456789abcdef0123456789', '0123456789abcdef0123456789'],
    ['curl https://hooks.slack.com/services/T000/B000/SEGREDO19abc', 'SEGREDO19abc'],
    ['echo -----BEGIN RSA PRIVATE KEY-----\nSEGREDO20LINHA\n-----END RSA PRIVATE KEY-----', 'SEGREDO20LINHA'],
  ];
  for (const [entrada, segredo] of casos) {
    assert.ok(!redigir(entrada).includes(segredo), `vazou: ${entrada} => ${redigir(entrada)}`);
  }
  // Não redige comando comum (sem falso positivo evidente).
  for (const ok of ['git push -u origin main', 'mkdir -p a/b', 'find . -prune -name x', 'rtk rg "token" src', 'ls -la']) {
    assert.strictEqual(redigir(ok), ok, `redigiu indevidamente: ${ok}`);
  }
  // Idempotente.
  assert.strictEqual(redigir(redigir('A_TOKEN=abc')), redigir('A_TOKEN=abc'));

  // ReDoS: entrada adversarial termina rápido.
  // Inclui entradas de exatamente o tamanho analisado (4096), que exercitam os quantificadores de 64.
  const adversarias = ['key'.repeat(40000), 'a'.repeat(200000), '-'.repeat(100000), 'mysql ' + ' x'.repeat(50000),
    'token'.repeat(30000) + ' =', 'key'.repeat(1365), '--' + 'token-'.repeat(680), 'mysql ' + '-p '.repeat(1360),
    '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(4000), 'Cookie:' + ' '.repeat(4000), '"' + 'password'.repeat(500), 'a://' + 'b'.repeat(4000)];
  for (const adv of adversarias) {
    const t0 = Date.now();
    redigir(adv);
    assert.ok(Date.now() - t0 < 2000, `redigir lento (${Date.now() - t0} ms) em entrada de ${adv.length} caracteres`);
  }

  // Caminho de URL: token de bot e assinatura longa são mascarados.
  assert.ok(!resumir('WebFetch', { url: 'https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getMe' }).includes('AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'));
  assert.strictEqual(resumir('WebFetch', { url: 'https://code.claude.com/docs/en/hooks-guide.md' }), 'https://code.claude.com/docs/en/hooks-guide.md');

  // extra: só bloqueado e motivo; nada sobrescreve campos base.
  registrar({ agent_id: 'abc', agent_type: 'scout', tool_name: 'Read', tool_input: { file_path: 'real.txt' } },
    { alvo: 'FALSO', agent_id: 'FALSO', ts: 'FALSO', extra_livre: 'x', bloqueado: true, motivo: 'm token=SEGREDO12' });
  const ult = ler().pop();
  assert.strictEqual(ult.alvo, 'real.txt');
  assert.strictEqual(ult.agent_id, 'abc');
  assert.ok(ult.ts !== 'FALSO' && !('extra_livre' in ult));
  assert.ok(!ult.motivo.includes('SEGREDO12'));
  fs.writeFileSync(arquivo, ''); // zera para os testes seguintes

  // URL sem query string; MCP sem alvo; truncamento.
  assert.strictEqual(resumir('WebFetch', { url: 'https://a.com/p?key=SEGREDO' }), 'https://a.com/p');
  assert.strictEqual(resumir('mcp__playwright__browser_click', { ref: 'x' }), '');
  assert.ok(resumir('Bash', { command: 'a'.repeat(500) }).length <= 201);

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
  assert.strictEqual(ler().pop().alvo, 'e');

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
