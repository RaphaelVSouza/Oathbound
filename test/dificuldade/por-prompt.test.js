'use strict';
// Teste de por-prompt.js: fixtures em diretório temporário via CUSTO_HOME; sem rede.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const pp = require('./por-prompt.js');

const CLI = path.join(__dirname, 'por-prompt.js');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dif-'));
const SEGREDO_CMD = 'SEGREDO_COMANDO_QWE';
const P1 = 'Implemente a função de cobrança com SEGREDO_PROMPT_UNO por favor';
const P2 = 'não ficou certo, refaça isso com mais cuidado, por favor';
const P3 = 'Agora documente o resultado final do trabalho feito';
const P4 = 'Não inclua exemplos na documentação deste outro projeto';

const jl = (...ls) => ls.map((l) => JSON.stringify(l)).join('\n') + '\n';
const humano = (txt, promptId) => ({ type: 'user', promptId, message: { role: 'user', content: txt } });
const resultado = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const asst = (id, blocos, usage, extra = {}) => ({
  type: 'assistant', requestId: 'r_' + id, ...extra,
  message: { id, model: 'claude-sonnet-5-5', content: blocos, usage },
});
const uso = (i, o) => ({ input_tokens: i, output_tokens: o });
const tool = (id, name, input) => ({ type: 'tool_use', id, name, input });

const dirP = path.join(home, 'projects', 'projA');
const sessao = 'aaaaaaaa-1111-2222-3333-444444444444';
fs.mkdirSync(path.join(dirP, sessao, 'subagents'), { recursive: true });

// m1 repete (streaming) com um bloco por linha; usage final prevalece.
fs.writeFileSync(path.join(dirP, sessao + '.jsonl'), jl(
  humano(P1, 'pid-1'),
  asst('m1', [tool('t1', 'Edit', { file_path: 'C:/a.js' })], uso(1, 1)),
  asst('m1', [tool('t2', 'Write', { file_path: 'C:/a.js' })], uso(1000000, 100000)),
  resultado(),
  asst('m2', [tool('t3', 'Bash', { command: `git push origin main # ${SEGREDO_CMD}` }), tool('t4', 'Edit', { file_path: 'C:/b.js' })], uso(1000000, 0)),
  resultado(),
  asst('m3', [tool('t5', 'Agent', { subagent_type: 'smith' })], uso(0, 0)),
  humano(P2, 'pid-2'),
  asst('m4', [tool('t6', 'Bash', { command: 'ls' })], uso(0, 1000000)),
  humano('/clear', 'pid-x'),
  humano(P3, 'pid-3'),
  asst('m5', [{ type: 'text', text: 'feito' }], uso(0, 0)),
));
// A primeira mensagem do segundo transcrito parece correção, mas não pertence ao P3.
fs.writeFileSync(path.join(dirP, 'bbbbbbbb-1111-2222-3333-444444444444.jsonl'), jl(
  humano(P4, 'pid-4'),
  asst('m6', [], uso(1000000, 0)),
));
// Sidechain ligada ao P1 pelo promptId da 1ª linha do arquivo, com mensagem duplicada; outra sem prompt correspondente.
fs.writeFileSync(path.join(dirP, sessao, 'subagents', 'agent-a1.jsonl'), jl(
  { type: 'user', isSidechain: true, promptId: 'pid-1', message: { role: 'user', content: 'tarefa' } },
  asst('s1', [], uso(0, 1000000), { isSidechain: true }),
  asst('s1', [], uso(0, 1000000), { isSidechain: true }),
));
fs.writeFileSync(path.join(dirP, sessao, 'subagents', 'agent-a2.jsonl'), jl(
  { type: 'user', isSidechain: true, promptId: 'pid-orfao', message: { role: 'user', content: 'tarefa' } },
  asst('s2', [], uso(1000000, 0), { isSidechain: true }),
));

const r = spawnSync(process.execPath, [CLI], { env: { ...process.env, CUSTO_HOME: home }, encoding: 'utf8' });
assert.strictEqual(r.status, 0, r.stderr);
const dir = path.join(home, 'state', 'dificuldade');
const json = fs.readFileSync(path.join(dir, 'por-prompt.json'), 'utf8');
const regs = JSON.parse(json);
const csv = fs.readFileSync(path.join(dir, 'rotulos.csv'), 'utf8');

// /clear curto fica de fora: P1, P2, P3, P4.
assert.strictEqual(regs.length, 4);
const [a, b, c, d] = regs;

// Dedup: m1 conta uma vez (1M in = 2, 100K out = 1); m2 1M in = 2; m3 zero. Sonnet 5.5: 2 in / 10 out por M.
assert.strictEqual(a.mensagens_assistente, 3);
assert.strictEqual(a.chamadas_ferramenta, 5);
assert.deepStrictEqual(a.ferramentas, { Edit: 2, Write: 1, Bash: 1, Agent: 1 });
assert.strictEqual(a.arquivos_editados, 2);
assert.strictEqual(a.subagentes_chamados, 1);
assert.deepStrictEqual(a.subagentes_por_tipo, { smith: 1 });
assert.strictEqual(a.turnos, 3);
assert.ok(Math.abs(a.custo_principal_usd - 5) < 1e-9, String(a.custo_principal_usd));
// Sidechain: s1 dedup = 10; s2 orfã fica de fora.
assert.ok(Math.abs(a.custo_subagente_usd - 10) < 1e-9, String(a.custo_subagente_usd));
assert.ok(Math.abs(a.custo_usd - 15) < 1e-9);
assert.strictEqual(a.custo_subagente_incluido, true);
assert.strictEqual(a.correcao_seguinte, true);
assert.ok(Math.abs(b.custo_usd - 10) < 1e-9);
assert.strictEqual(b.irreversivel, false);
assert.strictEqual(b.correcao_seguinte, false);
assert.strictEqual(c.custo_usd, 0);
assert.strictEqual(c.correcao_seguinte, false);
assert.strictEqual(d.correcao_seguinte, false);

// irreversivel registra categoria, nunca o comando.
assert.strictEqual(a.irreversivel, true);
assert.deepStrictEqual(a.categorias_irreversivel, ['git-push']);
assert.ok(!json.includes(SEGREDO_CMD) && !csv.includes(SEGREDO_CMD) && !r.stdout.includes(SEGREDO_CMD));

// por-prompt.json e stdout sem texto de prompt; id é hash de 8 hex.
assert.ok(!json.includes('SEGREDO_PROMPT_UNO') && !r.stdout.includes('SEGREDO_PROMPT_UNO'));
assert.ok(regs.every((x) => /^[0-9a-f]{8}$/.test(x.id)));
const stdout = JSON.parse(r.stdout);
assert.strictEqual(stdout.sidechain_nao_ligadas, 1);
assert.strictEqual(stdout.prompts_elegiveis, 4);
assert.strictEqual(stdout.rotulos_csv_criado, true);

// CSV: colunas id,texto,rotulo; rótulo vazio; sem custo.
const linhas = pp.lerCsv(csv);
assert.deepStrictEqual(linhas[0], ['id', 'texto', 'rotulo']);
assert.strictEqual(linhas.length, 5);
for (const l of linhas.slice(1)) assert.strictEqual(l[2], '');
assert.ok(linhas.some((l) => l[1].includes('SEGREDO_PROMPT_UNO')));
assert.ok(!/custo|usd|22\.5|turnos/i.test(csv));

// Truncamento a 240 e redação.
{
  const h2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dif2-'));
  const d = path.join(h2, 'projects', 'p');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 's.jsonl'), jl(humano('x'.repeat(500) + ' password=hunter2xyz', 'q1')));
  spawnSync(process.execPath, [CLI], { env: { ...process.env, CUSTO_HOME: h2 } });
  const l = pp.lerCsv(fs.readFileSync(path.join(h2, 'state', 'dificuldade', 'rotulos.csv'), 'utf8'));
  assert.strictEqual(l[1][1].length, 240);
  fs.rmSync(h2, { recursive: true, force: true });
}

// Spearman em casos conhecidos.
assert.strictEqual(pp.spearman([1, 2, 3, 4], [10, 20, 30, 99]), 1);
assert.strictEqual(pp.spearman([1, 2, 3, 4], [9, 7, 5, 1]), -1);
assert.deepStrictEqual(pp.postos([5, 5, 1, 9]), [2.5, 2.5, 1, 4]);
assert.strictEqual(pp.spearman([1, 1, 1], [1, 2, 3]), null);
// Com empates: postos x = [1.5,1.5,3,4], y = [1,2,3,4]; rho = 0.9486832980505138.
assert.ok(Math.abs(pp.spearman([1, 1, 2, 3], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12);

// Quartis e veredito.
assert.deepStrictEqual(pp.quartis([1, 2, 3, 4, 5]), { min: 1, q1: 2, mediana: 3, q3: 4, max: 5 });
assert.strictEqual(pp.veredito(0.5, 0.1).descartar, false);
assert.strictEqual(pp.veredito(0.39, 0.1).descartar, true);
assert.strictEqual(pp.veredito(0.8, 0.16).descartar, true);
assert.strictEqual(pp.veredito(null, 0).descartar, true);

// Heurísticas.
assert.strictEqual(pp.indicaCorrecao('Está ERRADO isso'), true);
assert.strictEqual(pp.indicaCorrecao('x'.repeat(80) + ' erro'), false);
assert.strictEqual(pp.indicaCorrecao('perfeito, siga adiante'), false);
assert.deepStrictEqual(pp.categoriasIrreversiveis('DELETE FROM t WHERE id=1'), []);
assert.deepStrictEqual(pp.categoriasIrreversiveis('DELETE FROM t'), ['delete-from']);
assert.deepStrictEqual(pp.categoriasIrreversiveis('rm -rf x; Remove-Item y'), ['rm', 'remove-item']);

// --correlacao: rótulos monotônicos com o custo => rho 1.
{
  const ids = regs.map((x) => x.id);
  const custos = Object.fromEntries(regs.map((x) => [x.id, x.custo_usd]));
  const ordem = [...ids].sort((x, y) => custos[x] - custos[y]);
  const rot = Object.fromEntries(ordem.map((id, i) => [id, i + 1]));
  const novo = ['id,texto,rotulo', ...ids.map((id) => `${id},"t, ""x""",${rot[id]}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'rotulos.csv'), novo);
  const rg = spawnSync(process.execPath, [CLI], { env: { ...process.env, CUSTO_HOME: home }, encoding: 'utf8' });
  assert.strictEqual(rg.status, 0, rg.stderr);
  assert.strictEqual(JSON.parse(rg.stdout).rotulos_csv_criado, false);
  assert.strictEqual(JSON.parse(rg.stdout).amostra_rotulos, 4);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'rotulos.csv'), 'utf8'), novo);
  const rc = spawnSync(process.execPath, [CLI, '--correlacao'], { env: { ...process.env, CUSTO_HOME: home }, encoding: 'utf8' });
  assert.strictEqual(rc.status, 0, rc.stderr);
  const o = JSON.parse(rc.stdout);
  assert.strictEqual(o.n, 4);
  assert.ok(Math.abs(o.spearman_rotulo_custo - 1) < 1e-12);
  assert.strictEqual(o.veredito.descartar, false);
  assert.ok(/±0,2/.test(o.aviso));
}

// Opção inválida.
assert.strictEqual(spawnSync(process.execPath, [CLI, '--x'], { encoding: 'utf8' }).status, 2);

fs.rmSync(home, { recursive: true, force: true });
console.log('por-prompt.test.js: ok');
