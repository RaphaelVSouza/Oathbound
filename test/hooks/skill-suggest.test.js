'use strict';
// Teste do hook de sugestão de skill. Rode: node test/hooks/skill-suggest.test.js
// Sem rede: o transporte é injetado. Nenhuma chamada real ao Jev.
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
  // Frontmatter: linha única, bloco dobrado (>-) e aspas.
  assert.deepStrictEqual(frontmatter('---\nname: a\ndescription: Faz A.\n---\ncorpo'), { nome: 'a', descricao: 'Faz A.' });
  assert.deepStrictEqual(frontmatter('---\nname: b\ndescription: >-\n  Faz B\n  em duas linhas.\n---\n'), { nome: 'b', descricao: 'Faz B em duas linhas.' });
  assert.strictEqual(frontmatter('sem frontmatter'), null);

  // Catálogo: próprias, plugin (só a versão mais recente) e `_disabled` ignorada.
  escrever('skills/grill-me/SKILL.md', '---\nname: grill-me\ndescription: Entrevista.\n---\n');
  escrever('skills/_disabled/velha/SKILL.md', '---\nname: velha\ndescription: Não deve entrar.\n---\n');
  escrever('plugins/cache/mkt/plug/0.9.0/skills/x/SKILL.md', '---\nname: x\ndescription: Versão antiga.\n---\n');
  escrever('plugins/cache/mkt/plug/0.10.0/skills/x/SKILL.md', '---\nname: x\ndescription: Versão nova.\n---\n');
  const cat = carregarCatalogo(path.join(tmp, 'home'));
  assert.deepStrictEqual([...cat.keys()].sort(), ['grill-me', 'plug:x']);
  assert.strictEqual(cat.get('plug:x'), 'Versão nova.');

  // Embaralhar: determinístico por semente, preserva o conjunto, muda com a semente.
  const nomes = Array.from({ length: 30 }, (_, i) => `s${i}`);
  assert.deepStrictEqual(embaralhar(nomes, 'p1'), embaralhar(nomes, 'p1'));
  assert.deepStrictEqual(embaralhar(nomes, 'p1').slice().sort(), nomes.slice().sort());
  assert.notDeepStrictEqual(embaralhar(nomes, 'p1'), embaralhar(nomes, 'p2'));

  // Perguntas: uma `choice` com todas as skills e duas `noul`.
  const q = montarPerguntas(cat, 'prompt');
  assert.strictEqual(q.skill.type, 'choice');
  assert.deepStrictEqual(Object.keys(q.skill.criteria).sort(), ['grill-me', 'plug:x']);
  assert.strictEqual(q.acao.type, 'noul');
  assert.strictEqual(q.nomeia.type, 'noul');

  // Decisão por limiares.
  const resp = (skill, conf, acao, nomeia) => ({ answers: {
    skill: { type: 'choice', choice: skill, confidence: conf },
    acao: { type: 'noul', noul: acao },
    nomeia: { type: 'noul', noul: nomeia },
  } });
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.8, 0.1), cat).sugerir, true);
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.1, 0.1), cat).sugerir, false, 'nenhuma skill desejada');
  assert.strictEqual(decidir(resp('grill-me', 0.9, 0.1, 0.6), cat).sugerir, true, 'nomeia basta');
  assert.strictEqual(decidir(resp('grill-me', 0.3, 0.9, 0.9), cat).sugerir, false, 'prob baixa');
  assert.strictEqual(decidir(resp('inventada', 0.9, 0.9, 0.9), cat).sugerir, false, 'skill fora do catálogo');
  assert.strictEqual(decidir({ answers: {} }, cat), null);
  assert.strictEqual(decidir(null, cat), null);
  assert.strictEqual(decidir(resp('grill-me', 'x', 0.9, 0.9), cat), null, 'campo não numérico');

  // sugerir: transporte falso.
  const buscar = (resposta, ok = true) => async () => ({ ok, json: async () => resposta });
  const base = { catalogo: cat, chave: 'k' };
  (async () => {
    const prompt = 'me sabatine sobre o plano da migração';
    const s = await sugerir(prompt, { ...base, buscar: buscar(resp('grill-me', 0.9, 0.8, 0.1)) });
    assert.strictEqual(s.skill, 'grill-me');
    assert.match(s.contexto, /<skill_relevance>[\s\S]*grill-me[\s\S]*<\/skill_relevance>/);

    // Sem chave, prompt curto, comando com barra, HTTP de erro, rede que falha, resposta inválida: nada.
    assert.strictEqual(await sugerir(prompt, { ...base, chave: '', buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir('oi', { ...base, buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir('/grill-me plano da migração', { ...base, buscar: buscar(resp('grill-me', 0.9, 1, 1)) }), null);
    assert.strictEqual(await sugerir(prompt, { ...base, buscar: buscar({}, false) }), null);
    await assert.rejects(sugerir(prompt, { ...base, buscar: async () => { throw new Error('rede'); } }));
    assert.strictEqual(await sugerir(prompt, { ...base, buscar: buscar({ lixo: 1 }) }), null);

    // Segredo é redigido antes de sair; o log não guarda o prompt.
    let corpo = '';
    const espia = async (_u, op) => { corpo = op.body; return { ok: true, json: async () => resp('grill-me', 0.9, 0.9, 0.9) }; };
    await sugerir('use a chave sk-abcdefghijklmnop1234 para me sabatinar', { ...base, buscar: espia });
    assert.ok(!corpo.includes('sk-abcdefghijklmnop1234'), 'segredo vazou no corpo');
    assert.ok(corpo.includes('"model":"jev-1.14.0"'));
    const log = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8');
    assert.ok(!log.includes('sabatin'), 'prompt no log');
    assert.ok(log.split('\n').filter(Boolean).every((l) => JSON.parse(l).modelo === 'jev-1.14.0'));

    // Modo subagente.
    escrever('agents/revisor-x.md', '---\nname: revisor-x\ndescription: Revisa código.\n---\n');
    escrever('agents/b.md', '---\nname: b\ndescription: Faz B.\n---\n');
    const sub = carregarSubagentes(path.join(tmp, 'home'));
    assert.strictEqual(sub.size, 7, 'catálogo de teste: 2 próprios + 5 embutidos');
    const real = carregarSubagentes(path.join(__dirname, '..', '..', 'claude'));
    assert.ok(['Explore', 'Plan', 'general-purpose', 'claude-code-guide', 'statusline-setup'].every((n) => real.has(n)));
    const qs = montarPerguntasSubagente(sub, 'prompt');
    assert.strictEqual(Object.values(qs).filter((x) => x.type === 'choice').length, 1);
    assert.strictEqual(Object.values(qs).filter((x) => x.type === 'noul').length, sub.size);
    assert.strictEqual(Object.keys(qs.subagente.criteria).length, sub.size + 1, 'catálogo mais inline');
    assert.ok(qs.subagente.criteria.inline.includes('sem delegar'));
    assert.ok(!qs.noul_inline, 'sem Noul para inline');
    assert.ok(!qs.acao && !qs.nomeia);
    assert.strictEqual(qs.noul_revisor_x.instructions, 'Este pedido deve ser delegado ao subagente revisor-x?');
    assert.strictEqual(qs.noul_revisor_x.criteria.true.faz, 'Revisa código.');
    assert.ok(Array.isArray(qs.noul_revisor_x.criteria.false.nao_faz));
    assert.ok(Object.values(qs).filter((x) => x.type === 'noul').every((x) => typeof x.criteria.true.faz === 'string' && x.criteria.false.nao_faz.length === 1));
    assert.deepStrictEqual(Object.keys(PARES_CONFUNDIDOS).sort(), ['Explore', 'assayer', 'claude-code-guide', 'general-purpose', 'scholar', 'scout', 'sentinel', 'smith']);
    const comPar = montarPerguntasSubagente(new Map([['smith', 'Implementa.'], ['general-purpose', 'Genérico.']]), 'prompt');
    assert.strictEqual(comPar.noul_smith.criteria.false.nao_faz[0], 'Pedido que cabe ao general-purpose: Genérico.');
    assert.ok(Object.keys(qs).every((k) => /^[A-Za-z0-9_]+$/.test(k)));
    const rs = (nome, conf, noul) => ({ answers: {
      subagente: { type: 'choice', choice: nome, confidence: 0, probabilities: { [nome]: conf } },
      [`noul_${nome.replace(/[^A-Za-z0-9]/g, '_')}`]: { type: 'noul', noul },
    } });
    assert.ok(LIMIAR_PROB_SUB === 0.5 && LIMIAR_NOUL_SUB_ALTO === 0.7 && LIMIAR_NOUL_SUB_BAIXO === 0.3);
    assert.deepStrictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.8), sub), { subagente: 'revisor-x', prob: 0.9, noul: 0.8, faixa: 'alta', sugerir: true });
    const lim = decidirSubagente(rs('revisor-x', 0.9, 0.7), sub);
    assert.ok(lim.faixa === 'alta' && lim.sugerir === true, '0,7 inclusivo sugere');
    const meio = decidirSubagente(rs('revisor-x', 0.9, 0.69), sub);
    assert.ok(meio.faixa === 'meio' && meio.sugerir === false, '0,69 cala com faixa meio');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.31), sub).faixa, 'meio');
    const baixa = decidirSubagente(rs('revisor-x', 0.9, 0.3), sub);
    assert.ok(baixa.faixa === 'baixa' && baixa.sugerir === false, '0,3 inclusivo cala');
    const inl = decidirSubagente({ answers: { subagente: { choice: 'inline', probabilities: { inline: 0.99 } } } }, sub);
    assert.deepStrictEqual(inl, { subagente: 'inline', prob: 0.99, noul: null, inline: true, sugerir: false });
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.4, 0.8), sub).sugerir, false, 'confiança baixa');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.4), sub).sugerir, false, 'noul na faixa do meio');
    assert.strictEqual(decidirSubagente(rs('Explore', 0.5, 0.7), sub).sugerir, true, 'prob inclusiva');
    assert.strictEqual(decidirSubagente(rs('revisor-x', 0.9, 0.4), sub, { alto: 0.4 }).sugerir, true, 'limiar customizado');
    assert.strictEqual(decidirSubagente(rs('inventado', 0.9, 0.9), sub).sugerir, false);
    assert.strictEqual(decidirSubagente({ answers: {} }, sub), null);
    assert.strictEqual(decidirSubagente({ answers: { subagente: { choice: 'Plan', probabilities: { Plan: 0.9 } } } }, sub), null, 'sem noul');
    const escolhaSemProb = rs('revisor-x', undefined, 1);
    escolhaSemProb.answers.subagente.confidence = 1;
    escolhaSemProb.answers.subagente.probabilities = { Plan: 0.95 };
    assert.strictEqual(decidirSubagente(escolhaSemProb, sub), null, 'confidence e probabilidade de outro agente não substituem a do escolhido');
    const outroNoulAlto = rs('revisor-x', 0.9, 0.3);
    outroNoulAlto.answers.noul_Plan = { type: 'noul', noul: 1 };
    assert.strictEqual(decidirSubagente(outroNoulAlto, sub).sugerir, false, 'usa somente o Noul do candidato escolhido');
    const bs = { catalogo: sub, chave: 'k' };
    const promptSub = 'revise o diff da migração do banco';
    const ss = await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.9, 0.9)) });
    assert.strictEqual(ss.subagente, 'revisor-x');
    assert.match(ss.contexto, /<subagent_relevance>\nSubagente possivelmente adequado: revisor-x\. Ignore se não combinar\.\n<\/subagent_relevance>/);
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.2, 0.9)) }), null);
    const naoConsultarJev = async () => assert.fail('pedido inelegível chamou Jev');
    const bsSemConsulta = { ...bs, buscar: naoConsultarJev };
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bsSemConsulta, chave: '' }), null);
    assert.strictEqual(await sugerirSubagente('oi', bsSemConsulta), null);
    assert.strictEqual(await sugerirSubagente('/x revise o diff da migração', bsSemConsulta), null);
    assert.strictEqual(await sugerirSubagente(promptSub, {
      ...bsSemConsulta, catalogo: new Map([['Plan', sub.get('Plan')]]),
    }), null, 'catálogo sem candidatos suficientes');
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar({}, false) }), null);
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar({ lixo: 1 }) }), null);
    await assert.rejects(sugerirSubagente(promptSub, { ...bs, buscar: async () => { throw new Error('rede'); } }));
    let corpoSub = '';
    const espiaSub = async (_u, op) => { corpoSub = op.body; return { ok: true, json: async () => rs('revisor-x', 0.9, 0.9) }; };
    await sugerirSubagente('use sk-abcdefghijklmnop1234 para revisar o diff', { ...bs, buscar: espiaSub });
    assert.ok(!corpoSub.includes('sk-abcdefghijklmnop1234'));
    const logSub = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.modo === 'subagente');
    const inlineResp = { answers: { subagente: { choice: 'inline', probabilities: { inline: 0.9 } } } };
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(inlineResp) }), null, 'inline calado');
    assert.strictEqual(await sugerirSubagente(promptSub, { ...bs, buscar: buscar(rs('revisor-x', 0.9, 0.5)) }), null, 'faixa meio calada');
    const logSub2 = fs.readFileSync(path.join(tmp, 'log', 'skill-suggest.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.modo === 'subagente');
    assert.ok(logSub2.some((l) => l.inline === true), 'log com inline');
    assert.ok(logSub2.some((l) => l.faixa === 'meio'), 'log com faixa meio');
    assert.ok(logSub2.some((l) => l.faixa === 'alta'), 'log com faixa alta');
    assert.ok(!JSON.stringify(logSub2).includes('migração'), 'prompt no log');
    assert.ok(logSub.length >= 1);
    assert.ok(!JSON.stringify(logSub).includes('migração'), 'prompt no log');
    assert.ok(!JSON.stringify(logSub).includes('diff'), 'prompt no log');

    // Processo real: sem chave e com stdin inválido, sai 0 sem stdout.
    const env = { ...process.env, JEV_API_KEY: '', SKILL_SUGGEST_HOME: path.join(tmp, 'home') };
    for (const entrada of [JSON.stringify({ prompt }), 'não é json', '']) {
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
