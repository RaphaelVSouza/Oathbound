'use strict';
// Skill suggestion hook test. Run: node test/hooks/skill-suggest.test.js
// Offline: transport is injected. No real Jev calls.
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-suggest-'));
process.env.SKILL_SUGGEST_LOG_DIR = path.join(tmp, 'log');
const { carregarCatalogo, montarPerguntas, decidir, sugerir, embaralhar, frontmatter,
  carregarSubagentes, montarPerguntasSubagente, decidirSubagente, sugerirSubagente, LIMIAR_PROB_SUB, LIMIAR_NOUL_SUB_ALTO, LIMIAR_NOUL_SUB_BAIXO, PARES_CONFUNDIDOS } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'skill-suggest.js'));

const escrever = (rel, texto) => {
  const arq = path.join(tmp, 'home', rel);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, texto);
};

try {
  // Frontmatter: single line, folded block (>-), and quotes.
  assert.deepStrictEqual(frontmatter('---\nname: a\ndescription: Does A.\n---\nbody'), { nome: 'a', descricao: 'Does A.' });
  assert.deepStrictEqual(frontmatter('---\nname: b\ndescription: >-\n  Does B\n  on two lines.\n---\n'), { nome: 'b', descricao: 'Does B on two lines.' });
  assert.strictEqual(frontmatter('no frontmatter'), null);

  // Catalog: local skills, plugin (latest version only), and ignored `_disabled`.
  escrever('skills/grill-me/SKILL.md', '---\nname: grill-me\ndescription: Interview.\n---\n');
  escrever('skills/_disabled/velha/SKILL.md', '---\nname: velha\ndescription: Must not be included.\n---\n');
  escrever('plugins/cache/mkt/plug/0.9.0/skills/x/SKILL.md', '---\nname: x\ndescription: Old version.\n---\n');
  escrever('plugins/cache/mkt/plug/0.10.0/skills/x/SKILL.md', '---\nname: x\ndescription: New version.\n---\n');
  const cat = carregarCatalogo(path.join(tmp, 'home'));
  assert.deepStrictEqual([...cat.keys()].sort(), ['grill-me', 'plug:x']);
  assert.strictEqual(cat.get('plug:x'), 'New version.');

  // Shuffle: deterministic per seed, preserves the set, changes with the seed.
  const nomes = Array.from({ length: 30 }, (_, i) => `s${i}`);
  assert.deepStrictEqual(embaralhar(nomes, 'p1'), embaralhar(nomes, 'p1'));
  assert.deepStrictEqual(embaralhar(nomes, 'p1').slice().sort(), nomes.slice().sort());
  assert.notDeepStrictEqual(embaralhar(nomes, 'p1'), embaralhar(nomes, 'p2'));

  // Questions: one `choice` with all skills and two `noul`.
  const q = montarPerguntas(cat, 'prompt');
  assert.strictEqual(q.skill.type, 'choice');
  assert.deepStrictEqual(Object.keys(q.skill.criteria).sort(), ['grill-me', 'plug:x']);
  assert.strictEqual(q.acao.type, 'noul');
  assert.strictEqual(q.nomeia.type, 'noul');

  // Threshold-based decision.
  const resp = (skill, conf, acao, nomeia) => ({ answers: {
    skill: { type: 'choice', choice: skill, confidence: conf },
    acao: { type: 'noul', noul: acao },
    nomeia: { type: 'noul', noul: nomeia },
  } });
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.8, 0.1), cat).sugerir, true);
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.1, 0.1), cat).sugerir, false, 'no skill wanted');
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.1, 0.6), cat).sugerir, true, 'naming suffices');
  assert.strictEqual(decidir(resp('grill-me', 0.3, 0.9, 0.9), cat).sugerir, false, 'low probability');
  assert.strictEqual(decidir(resp('inventada', 0.9, 0.9, 0.9), cat).sugerir, false, 'skill outside the catalog');
  assert.strictEqual(decidir({ answers: {} }, cat), null);
  assert.strictEqual(decidir(null, cat), null);
  assert.strictEqual(decidir(resp('grill-me', 'x', 0.9, 0.9), cat), null, 'nonnumeric field');

  // sugerir: fake transport.
  const buscar = (resposta, ok = true) => async () => ({ ok, json: async () => resposta });
  const base = { catalogo: cat, chave: 'k' };
  (async () => {
    const prompt = 'grill me about the migration plan';
    const s = await sugerir(prompt, { ...base, buscar: buscar(resp('grill-me', 0.9, 0.8, 0.1)) });
    assert.strictEqual(s.skill, 'grill-me');
    assert.match(s.contexto, /<skill_relevance>[\s\S]*grill-me[\s\S]*<\/skill_relevance>/);

    // Missing key, short prompt, slash command, HTTP error, network failure, invalid response: nothing.
    assert.strictEqual(await sugerir(prompt, { ...base, chave: '', buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir('oi', { ...base, buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir('/grill-me migration plan', { ...base, buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir(prompt, { ...base, buscar: buscar({}, false) }), null);
    await assert.rejects(sugerir(prompt, { ...base, buscar: async () => { throw new Error('rede'); } }));
    assert.strictEqual(await sugerir(prompt, { ...base, buscar: buscar({ lixo: 1 }) }), null);

    // Secret is redacted before leaving; the log does not store the prompt.
    let corpo = '';
    const espia = async (_u, op) => { corpo = op.body; return { ok: true, json: async () => resp('grill-me', 0.9, 0.9, 0.9) }; };
    await sugerir('use key sk-abcdefghijklmnop1234 to interview me', { ...base, buscar: espia });
    assert.ok(!corpo.includes('sk-abcdefghijklmnop1234'), 'secret leaked in body');
    assert.ok(corpo.includes('"model":"jev-1.14.0"'));
    const log = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8');
    assert.ok(!log.includes('interview'), 'prompt in log');
    assert.ok(log.split('\n').filter(Boolean).every((l) => JSON.parse(l).modelo === 'jev-1.14.0'));

    // Subagent mode.
    escrever('agents/revisor-x.md', '---\nname: revisor-x\ndescription: Reviews code.\n---\n');
    escrever('agents/b.md', '---\nname: b\ndescription: Does B.\n---\n');
    const sub = carregarSubagentes(path.join(tmp, 'home'));
    assert.strictEqual(sub.size, 7, 'test catalog: 2 local + 5 built-in');
    const real = carregarSubagentes(path.join(__dirname, '..', '..', 'claude'));
    assert.ok(['Explore', 'Plan', 'general-purpose', 'claude-code-guide', 'statusline-setup'].every((n) => real.has(n)));
    const qs = montarPerguntasSubagente(sub, 'prompt');
    assert.strictEqual(Object.values(qs).filter((x) => x.type === 'choice').length, 1);
    assert.strictEqual(Object.values(qs).filter((x) => x.type === 'noul').length, sub.size);
    assert.strictEqual(Object.keys(qs.subagente.criteria).length, sub.size + 1, 'catalog plus inline');
    assert.ok(qs.subagente.criteria.inline.includes('without delegation'));
    assert.ok(!qs.noul_inline, 'no Noul for inline');
    assert.ok(!qs.acao && !qs.nomeia);
    assert.strictEqual(qs.noul_revisor_x.instructions, 'Should this request be delegated to subagent revisor-x?');
    assert.strictEqual(qs.noul_revisor_x.criteria.true.faz, 'Reviews code.');
    assert.ok(Array.isArray(qs.noul_revisor_x.criteria.false.nao_faz));
    assert.ok(Object.values(qs).filter((x) => x.type === 'noul').every((x) => typeof x.criteria.true.faz === 'string' && x.criteria.false.nao_faz.length === 1));
    assert.deepStrictEqual(Object.keys(PARES_CONFUNDIDOS).sort(), ['Explore', 'assayer', 'claude-code-guide', 'general-purpose', 'scholar', 'scout', 'sentinel', 'smith']);
    const comPar = montarPerguntasSubagente(new Map([['smith', 'Implements.'], ['general-purpose', 'Generic.']]), 'prompt');
    assert.strictEqual(comPar.noul_smith.criteria.false.nao_faz[0], 'Request suited to general-purpose: Generic.');
    assert.ok(Object.keys(qs).every((k) => /^[A-Za-z0-9_]+$/.test(k)));
    const rs = (nome, conf, noul) => ({ answers: {
      subagente: { type: 'choice', choice: nome, confidence: 0, probabilities: { [nome]: conf } },
      [`noul_${nome.replace(/[^A-Za-z0-9]/g, '_')}`]: { type: 'noul', noul },
    } });
    assert.ok(LIMIAR_PROB_SUB === 0.5 && LIMIAR_NOUL_SUB_ALTO === 0.7 && LIMIAR_NOUL_SUB_BAIXO === 0.3);
    assert.deepStrictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.8), sub), { subagente: 'revisor-x', prob: 0.9, noul: 0.8, faixa: 'alta', sugerir: true });
    const lim = decidirSubagente(rs('revisor-x', 0.9, 0.7), sub);
    assert.ok(lim.faixa === 'alta' && lim.sugerir === true, 'inclusive 0.7 suggests');
    const meio = decidirSubagente(rs('revisor-x', 0.9, 0.69), sub);
    assert.ok(meio.faixa === 'meio' && meio.sugerir === false, '0.69 stays silent in middle band');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.31), sub).faixa, 'meio');
    const baixa = decidirSubagente(rs('revisor-x', 0.9, 0.3), sub);
    assert.ok(baixa.faixa === 'baixa' && baixa.sugerir === false, 'inclusive 0.3 stays silent');
    const inl = decidirSubagente({ answers: { subagente: { choice: 'inline', probabilities: { inline: 0.99 } } } }, sub);
    assert.deepStrictEqual(inl, { subagente: 'inline', prob: 0.99, noul: null, inline: true, sugerir: false });
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.4, 0.8), sub).sugerir, false, 'low confidence');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.4), sub).sugerir, false, 'noul in middle band');
    assert.strictEqual(decidirSubagente(rs('Explore', 0.5, 0.7), sub).sugerir, true, 'inclusive probability');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.4), sub, { alto: 0.4 }).sugerir, true, 'custom threshold');
    assert.strictEqual(decidirSubagente(rs('inventado', 0.9, 0.9), sub).sugerir, false);
    assert.strictEqual(decidirSubagente({ answers: {} }, sub), null);
    assert.strictEqual(decidirSubagente({ answers: { subagente: { choice: 'Plan', probabilities: { Plan: 0.9 } } } }, sub), null, 'no noul');
    const escolhaSemProb = rs('revisor-x', undefined, 1);
    escolhaSemProb.answers.subagente.confidence = 1;
    escolhaSemProb.answers.subagente.probabilities = { Plan: 0.95 };
    assert.strictEqual(decidirSubagente(escolhaSemProb, sub), null, 'confidence and another agent probability do not replace the selected probability');
    const outroNoulAlto = rs('revisor-x', 0.9, 0.3);
    outroNoulAlto.answers.noul_Plan = { type: 'noul', noul: 1 };
    assert.strictEqual(decidirSubagente(outroNoulAlto, sub).sugerir, false, 'uses only the selected candidate Noul');
    const bs = { catalogo: sub, chave: 'k' };
    const promptSub = 'review the database migration diff';
    const ss = await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.9, 0.9)) });
    assert.strictEqual(ss.subagente, 'revisor-x');
    assert.match(ss.contexto, /<subagent_relevance>\nPossibly suitable subagent: revisor-x\. Ignore if it does not match\.\n<\/subagent_relevance>/);
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.2, 0.9)) }), null);
    const naoConsultarJev = async () => assert.fail('ineligible request called Jev');
    const bsSemConsulta = { ...bs, buscar: naoConsultarJev };
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bsSemConsulta, chave: '' }), null);
    assert.strictEqual(await sugerirSubagente('oi', bsSemConsulta), null);
    assert.strictEqual(await sugerirSubagente('/x review the migration diff', bsSemConsulta), null);
    assert.strictEqual(await sugerirSubagente(promptSub, {
      ...bsSemConsulta, catalogo: new Map([['Plan', sub.get('Plan')]]),
    }), null, 'catalog without enough candidates');
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar({}, false) }), null);
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar({ lixo: 1 }) }), null);
    await assert.rejects(sugerirSubagente(promptSub, { ...bs, buscar: async () => { throw new Error('rede'); } }));
    let corpoSub = '';
    const espiaSub = async (_u, op) => { corpoSub = op.body; return { ok: true, json: async () => rs('revisor-x', 0.9, 0.9) }; };
    await sugerirSubagente('use sk-abcdefghijklmnop1234 to review the diff', { ...bs, buscar: espiaSub });
    assert.ok(!corpoSub.includes('sk-abcdefghijklmnop1234'));
    const logSub = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.modo === 'subagente');
    const inlineResp = { answers: { subagente: { choice: 'inline', probabilities: { inline: 0.9 } } } };
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(inlineResp) }), null, 'silent inline');
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.9, 0.5)) }), null, 'silent middle band');
    const logSub2 = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.modo === 'subagente');
    assert.ok(logSub2.some((l) => l.inline === true), 'log with inline');
    assert.ok(logSub2.some((l) => l.faixa === 'meio'), 'log with middle band');
    assert.ok(logSub2.some((l) => l.faixa === 'alta'), 'log with high band');
    assert.ok(!JSON.stringify(logSub2).includes('migration'), 'prompt in log');
    assert.ok(logSub.length >= 1);
    assert.ok(!JSON.stringify(logSub).includes('migration'), 'prompt in log');
    assert.ok(!JSON.stringify(logSub).includes('diff'), 'prompt in log');

    // Real process: no key and invalid stdin exits 0 without stdout.
    const env = { ...process.env, JEV_API_KEY: '', SKILL_SUGGEST_HOME: path.join(tmp, 'home') };
    for (const entrada of [JSON.stringify({ prompt }), 'not json', '']) {
      const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'claude', 'hooks', 'skill-suggest.js')], { input: entrada, env, encoding: 'utf8' });
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.stdout, '');
    }
    console.log('skill-suggest: ok');
    fs.rmSync(tmp, { recursive: true, force: true });
  })().catch((e) => { console.error(e); process.exitCode = 1; });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
