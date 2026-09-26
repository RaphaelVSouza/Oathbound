#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { options, one } = require('./cli-options');
const { run } = require('./process-runner');
const { git, repoPaths } = require('./git');
const { runSession } = require('./run');
const { openStore } = require('./store');
const { ROLES, stateDir } = require('./roles');
const { readEnv } = require('./env');

const tail = (value, count) => value.split(/\r?\n/).slice(-count).map(x => x.slice(0, 240)).join('\n');

// G-003: teto de caracteres embutidos no prompt do reviewer. Todo adapter de runner
// (claude/opencode/codex/agy/generic) recebe a mensagem via argv, não stdin; no Windows o limite
// de CreateProcess é 32767 caracteres pra linha de comando inteira. 20000 caracteres de diff deixa
// margem confortável pro resto do prompt, variáveis de ambiente herdadas e o escaping do shell.
const DIFF_EMBED_LIMIT = 20000;

/** Monta o diff do escopo (rastreado + conteúdo de arquivos novos) pro reviewer.
 * @param {string} root
 * @param {string[]} scopes
 * @returns {Promise<string>} Vazio quando não há mudança nenhuma no escopo.
 */
async function buildScopeDiff(root, scopes) {
  const tracked = await git(root, 'diff', '--', ...scopes);
  const untrackedList = (await git(root, 'ls-files', '--others', '--exclude-standard', '--', ...scopes))
    .split('\n').filter(Boolean);
  const untrackedBlocks = untrackedList.map(file => {
    let content;
    try { content = fs.readFileSync(path.join(root, file), 'utf8'); } catch { content = '(binário ou ilegível)'; }
    return `diff --novo-arquivo --- /dev/null +++ ${file}\n${content}`;
  });
  return [tracked, ...untrackedBlocks].filter(Boolean).join('\n\n');
}

async function queue(argv) {
  const o = options(argv, ['-d', '-A', '-s', '-S', '-V', '-t', '-C', '-T', '-u', '--runner', '-e', '--effort'], ['-P']);
  const dir = one(o, '-d'), acceptArg = one(o, '-A'), scopes = o['-s'] || [];
  const runner = one(o, '--runner') || one(o, '-u') || readEnv('RUNNER') || 'opencode';
  const effort = one(o, '--effort') || one(o, '-e') || readEnv('EFFORT') || '';
  if (!dir || !acceptArg || !scopes.length || !o._.length) throw Error('uso: node queue.js -d repo -A aceite.txt -s glob -- issue.md ...');
  const { root, gitDir } = await repoPaths(dir);
  // -A resolve contra a raiz do repo, como a issue (G-010). Compatibilidade: se só existir
  // a partir do cwd atual, usa o cwd e avisa (uma vez) que esse fallback será removido.
  const acceptFromRoot = path.resolve(root, acceptArg);
  const acceptFromCwd = path.resolve(acceptArg);
  let accept = acceptFromRoot;
  if (!fs.existsSync(acceptFromRoot) && fs.existsSync(acceptFromCwd)) {
    accept = acceptFromCwd;
    process.stderr.write(`── aviso: -A '${acceptArg}' resolvido contra o diretório atual, não a raiz do repo; esse fallback será removido — use um caminho relativo à raiz ou absoluto\n`);
  }
  if (!fs.existsSync(accept)) throw Error('uso: node queue.js -d repo -A aceite.txt -s glob -- issue.md ...');
  if (!fs.statSync(accept).isFile()) { const e = Error(`-A precisa ser um arquivo, não diretório: ${accept}`); e.code = 2; throw e; }
  const state = path.join(stateDir(gitDir), 'state');
  fs.mkdirSync(state, { recursive: true });
  let store = null;
  try {
    store = openStore(path.join(stateDir(gitDir), 'oathbound.db'));
  } catch {}
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'oathbound-queue-'));
  console.log(`── oathbound queue: logs em ${work}`);
  let rs = one(o, '-S'), vs = one(o, '-V');
  for (const issue of o._) {
    const issuePath = path.resolve(root, issue);
    if (!fs.existsSync(issuePath)) throw Error(`issue ausente: ${issue}`);
    if (!fs.statSync(issuePath).isFile()) { const e = Error(`issue precisa ser um arquivo, não diretório: ${issue}`); e.code = 2; throw e; }
    // Id = caminho relativo à raiz sem extensão, separadores trocados por "--".
    // Evita colisão de "avô-nome" (G-012): a/x/001.md e a/y/001.md tinham o mesmo id "a-001".
    const relIssue = path.relative(root, issuePath).replaceAll('\\', '/');
    const id = relIssue.replace(/\.md$/, '').split('/').join('--');
    const legacyId = `${path.basename(path.dirname(path.dirname(issue)))}-${path.basename(issue, '.md')}`;
    if (o['-P']) { rs = ''; vs = ''; }
    const marker = path.join(state, id);
    const legacyMarker = path.join(state, legacyId);
    let stage = store?.getStage(id) || (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '');
    if (!stage && id !== legacyId) {
      const legacyStage = store?.getStage(legacyId) || (fs.existsSync(legacyMarker) ? fs.readFileSync(legacyMarker, 'utf8').trim() : '');
      if (legacyStage) {
        stage = legacyStage;
        fs.writeFileSync(marker, legacyStage);
        store?.setStage(id, legacyStage);
        console.log(`##### ${id} checkpoint migrado do id legado ${legacyId}`);
      }
    }
    if (stage === 'revisada') { console.log(`##### ${id} já revisada (checkpoint) — pulando`); continue; }
    if (stage !== 'implementada') {
      const message = `${root}\nIssue da fila: ${issue} (leia-a inteira).\n${fs.readFileSync(accept, 'utf8')}`;
      const outFile = path.join(work, `${id}.out`);
      const r = await runSession({
        repo: root,
        runner,
        effort,
        timeout: Number(one(o, '-t', '2400')),
        label: id,
        session: rs,
        scopes,
        message,
        output: false,
        logFile: outFile
      });
      fs.appendFileSync(outFile, r.receipt);
      rs = r.session || rs;
      console.log(`##### ${id} runner exit=${r.code} sessao=${rs}`);
      const important = (r.stdout + r.receipt).split(/\r?\n/).filter(x => /ACEITE|FONTES|CHECKLIST|NOTA|FORA DO ESCOPO/.test(x));
      console.log(tail(important.length ? important.join('\n') : r.stdout + r.receipt, 30));
      if (r.code !== 0) {
        // G-013: exit 3 (edição fora do escopo declarado) também para a fila — não é um
        // aviso informativo. Lista os arquivos fora do escopo e não marca a issue como
        // implementada, pra não perder o rastro do que precisa de revisão manual.
        console.log(`── fila parada em ${id} (exit ${r.code})`);
        if (r.code === 3 && r.outside?.length) {
          console.log(`── arquivos fora do escopo declarado (-s):\n${r.outside.map(p => `   ! ${p}`).join('\n')}`);
        }
        store?.close();
        return r.code;
      }
      console.log(`##### ${id} diff (git, não o agente):`);
      console.log(tail(await git(root, 'diff', '--stat', '--', ...scopes), 15));
      console.log((await git(root, 'ls-files', '--others', '--exclude-standard', '--', ...scopes)).split('\n').filter(Boolean).map(x => `  novo: ${x}`).join('\n'));
      for (const check of o['-C'] || []) {
        const log = path.join(work, `${id}.check.log`);
        const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
        const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', check] : ['-c', check];
        const stream = fs.createWriteStream(log);
        const c = await run(shell, shellArgs, { cwd: root, timeout: Number(one(o, '-T', '900')), capture: false, onData: b => stream.write(b) });
        await new Promise(resolve => stream.end(resolve));
        if (c.code) {
          fs.writeFileSync(marker, `falhou ${log}`);
          store?.setStage(id, 'falhou', log);
          console.log(`── fila parada em ${id}: checagem falhou (${check}); log ${log}`);
          store?.close();
          return 5;
        }
        console.log(`##### ${id} checagem ok: ${check}`);
      }
      fs.writeFileSync(marker, 'implementada');
      store?.setStage(id, 'implementada');
    } else console.log(`##### ${id} já implementada (checkpoint) — só revisão`);
    // G-003: o reviewer roda com -R (sem escrita) e não tinha acesso ao diff em si —
    // recebia só a issue e tinha que confiar/re-executar. Anexa o diff real no prompt.
    const scopeDiff = await buildScopeDiff(root, scopes);
    if (!scopeDiff.trim()) {
      console.error(`── fila parada em ${id}: diff do escopo vazio (nada pra revisar) — verifique -s`);
      store?.close();
      return 6;
    }
    const diffFile = path.join(stateDir(gitDir), 'review', `${id}.diff`);
    fs.mkdirSync(path.dirname(diffFile), { recursive: true });
    fs.writeFileSync(diffFile, scopeDiff);
    const diffSection = scopeDiff.length > DIFF_EMBED_LIMIT
      ? `${scopeDiff.slice(0, DIFF_EMBED_LIMIT)}\n\n[...diff truncado em ${DIFF_EMBED_LIMIT} caracteres; íntegra em ${diffFile}]`
      : scopeDiff;
    const prompt = `${root}\nRevise o diff abaixo (git, escopo ${scopes.join(', ')}) contra ${issue}. Só bug real ou risco com severidade, e teste que passa sem a mudança. Termine com a linha "No issues." ou com os achados no formato caminho:linha: <emoji> severidade: descrição.\n\n${diffSection}`;
    const reviewFile = path.join(work, `${id}.rev`);
    const v = await runSession({
      repo: root,
      runner,
      effort,
      agent: ROLES.reviewer,
      readonly: true,
      timeout: 900,
      label: `rev-${id}`,
      session: vs,
      message: prompt,
      output: false,
      logFile: reviewFile
    });
    const review = v.stdout + v.stderr + v.receipt;
    fs.appendFileSync(reviewFile, v.receipt);
    if (v.code) {
      console.error(`── fila parada em ${id}: reviewer exit=${v.code}; log ${path.join(work, `${id}.rev`)}`);
      console.error(tail(review, 30));
      store?.close();
      return v.code;
    }
    // G-002: normaliza cada linha (remove espaço, crase e asterisco das pontas) antes de
    // comparar, porque o reviewer às vezes envolve o recibo em formatação Markdown
    // ("`No issues.`", "**No issues.**", bloco de código) sem mudar o conteúdo.
    const normalizedLines = review.split(/\r?\n/).map(line => line.trim().replace(/^[`*]+|[`*]+$/g, '').trim());
    const normalizedReview = normalizedLines.join('\n');
    if (!/^No issues\.$|^totals:|^[^\s]+:\d+: (🔴|🟡|🔵|❓)/m.test(normalizedReview)) {
      console.error(`── fila parada em ${id}: reviewer sem recibo conclusivo; log ${path.join(work, `${id}.rev`)}`);
      store?.close();
      return 6;
    }
    vs = v.session || vs;
    console.log(`##### ${id} reviewer sessao=${vs}`);
    console.log(tail(review.split(/\r?\n/).filter(x => /🔴|🟡|❓|totals|No issues\./.test(x)).join('\n'), 12));
    fs.writeFileSync(marker, 'revisada');
    store?.setStage(id, 'revisada');
  }
  store?.close();
  console.log(`── oathbound queue: fim; sessoes runner=${rs} reviewer=${vs}`);
  return 0;
}
if (require.main === module) {
  queue(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(e => { console.error(e.message); process.exitCode = 2; });
}

module.exports = {
  queue
};
