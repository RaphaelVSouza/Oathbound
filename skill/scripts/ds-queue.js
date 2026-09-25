#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { options, one } = require('./cli-options');
const { run } = require('./process-runner');
const { git, repoPaths } = require('./git');
const { runSession } = require('./ds-run');
const { openGovernanceStore } = require('./governance-db');

const tail = (value, count) => value.split(/\r?\n/).slice(-count).map(x => x.slice(0, 240)).join('\n');
async function queue(argv) {
  const o = options(argv, ['-d', '-A', '-s', '-S', '-V', '-t', '-C', '-T'], ['-P']);
  const dir = one(o, '-d'), accept = one(o, '-A'), scopes = o['-s'] || [];
  if (!dir || !fs.existsSync(accept) || !scopes.length || !o._.length) throw Error('uso: node ds-queue.js -d repo -A aceite.txt -s glob -- issue.md ...');
  const { root, gitDir } = await repoPaths(dir);
  const state = path.join(gitDir, 'ds-queue', 'state');
  fs.mkdirSync(state, { recursive: true });
  let store = null;
  try {
    store = openGovernanceStore(path.join(gitDir, 'ds-queue', 'governance.db'));
  } catch {}
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-queue-'));
  console.log(`── ds-queue: logs em ${work}`);
  let rs = one(o, '-S'), vs = one(o, '-V');
  for (const issue of o._) {
    const issuePath = path.resolve(root, issue);
    if (!fs.existsSync(issuePath)) throw Error(`issue ausente: ${issue}`);
    const id = `${path.basename(path.dirname(path.dirname(issue)))}-${path.basename(issue, '.md')}`;
    if (o['-P']) { rs = ''; vs = ''; }
    const marker = path.join(state, id);
    const stage = store?.getStage(id) || (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : '');
    if (stage === 'revisada') { console.log(`##### ${id} já revisada (checkpoint) — pulando`); continue; }
    if (stage !== 'implementada') {
      const message = `${root}\nIssue da fila: ${issue} (leia-a inteira).\n${fs.readFileSync(accept, 'utf8')}`;
      const outFile = path.join(work, `${id}.out`);
      const r = await runSession({
        repo: root,
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
      if (r.code !== 0 && r.code !== 3) {
        console.log(`── fila parada em ${id} (exit ${r.code})`);
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
    const prompt = `${root}\nRevise o git diff do escopo (inclua não rastreados) contra ${issue}. Só bug real ou risco com severidade, e teste que passa sem a mudança.`;
    const reviewFile = path.join(work, `${id}.rev`);
    const v = await runSession({
      repo: root,
      agent: 'ds-reviewer',
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
    if (!/^No issues\.$|^totals:|^[^\s]+:\d+: (🔴|🟡|🔵|❓)/m.test(review)) {
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
  console.log(`── ds-queue: fim; sessoes runner=${rs} reviewer=${vs}`);
  return 0;
}
queue(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(e => { console.error(e.message); process.exitCode = 2; });
