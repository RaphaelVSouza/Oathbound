#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { options, one, sleep, run, alive, globMatch, snapshot, repoPaths } = require('./lib');
const { killRegistered } = require('./ds-kill');

function overlap(a, b) {
  const prefix = x => x.split(/[*?[]/, 1)[0];
  return prefix(a).startsWith(prefix(b)) || prefix(b).startsWith(prefix(a));
}
async function mutex(dir, action) {
  const lock = path.join(dir, 'mutex');
  for (let n = 0; n < 100; n++) {
    try { fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'pid'), String(process.pid)); break; }
    catch {
      const owner = Number(fs.existsSync(path.join(lock, 'pid')) ? fs.readFileSync(path.join(lock, 'pid'), 'utf8') : 0);
      if (owner && !alive(owner)) { fs.rmSync(lock, { recursive: true, force: true }); continue; }
      if (n === 99) throw Error(`mutex preso: ${lock}`);
      await sleep(200);
    }
  }
  try { return await action(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
function temporaryAgent(file, name, others) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/^  edit:$/m.test(src)) return '';
  const lines = src.split('\n'), result = [];
  let inside = false;
  for (const line of lines) {
    if (inside && !/^    /.test(line)) {
      for (const g of others) result.push(`    ${JSON.stringify(g.glob)}: deny`, `    ${JSON.stringify(g.glob + '*')}: deny`);
      inside = false;
    }
    result.push(line);
    if (line === '  edit:') inside = true;
  }
  const target = path.join(path.dirname(file), `${name}-lk${process.pid}.md`);
  fs.writeFileSync(target, result.join('\n'));
  return target;
}

async function dsRun(args, output = true, logFile = '') {
  const o = options(args, ['-d', '-a', '-m', '-t', '-s', '-f', '-S', '-L'], ['-R']);
  const dir = one(o, '-d'), agent = one(o, '-a', 'ds-runner');
  const model = one(o, '-m', process.env.GOVKIT_MODEL || '');
  const timeout = Number(one(o, '-t', '1800'));
  const scopes = o['-s'] || [], readonly = !!o['-R'];
  const sessionInput = one(o, '-S'), label = one(o, '-L', agent);
  if (!dir || !Number.isInteger(timeout) || timeout <= 0 || (readonly ? scopes.length : !scopes.length)) throw Error('uso: node ds-run.js -d repo (-R | -s glob) [-a agente] [-t segundos] -- mensagem');
  let message = one(o, '-f') ? fs.readFileSync(one(o, '-f'), 'utf8') : o._.join(' ');
  if (!message.trim()) throw Error('falta mensagem');
  const { root, gitDir } = await repoPaths(dir);
  const agentDir = process.env.GOVKIT_AGENT_DIR || path.join(root, '.opencode', 'agents');
  const agentFile = path.join(agentDir, `${agent}.md`);
  if (!fs.existsSync(agentFile)) throw Error(`agente ausente: ${agentFile}`);
  if (readonly && !/^  edit: deny$/m.test(fs.readFileSync(agentFile, 'utf8'))) throw Error(`-R exige edit: deny no agente: ${agent}`);
  const queueDir = path.join(gitDir, 'ds-queue'), claimDir = path.join(queueDir, 'claims');
  fs.mkdirSync(claimDir, { recursive: true });
  const others = [], claim = path.join(claimDir, `${process.pid}.claim`);
  let claimed = false, tempAgent = '', tag = '';
  try {
    if (!readonly) await mutex(queueDir, () => {
      for (const file of fs.readdirSync(claimDir).filter(x => x.endsWith('.claim'))) {
        const pid = Number(file.slice(0, -6)), target = path.join(claimDir, file);
        if (!alive(pid)) { fs.rmSync(target, { force: true }); continue; }
        const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/);
        const otherLabel = lines.find(x => x.startsWith('label='))?.slice(6) || file;
        for (const glob of lines.filter(x => x.startsWith('glob=')).map(x => x.slice(5))) {
          for (const mine of scopes) if (overlap(mine, glob)) { const e = Error(`conflito de posse — '${mine}' sobrepõe '${glob}' de ${otherLabel} (pid ${pid})`); e.code = 4; throw e; }
          others.push({ glob, label: otherLabel });
        }
      }
      fs.writeFileSync(claim, [`label=${label}`, `agent=${agent}`, `start=${Date.now()}`, ...scopes.map(g => `glob=${g}`)].join('\n'));
      claimed = true;
    });
    if (others.length) {
      tempAgent = temporaryAgent(agentFile, agent, others);
      message += `\nEm uso por outros agentes — só leitura, não edite: ${others.map(x => `${x.glob} (${x.label})`).join('; ')}`;
    }
    const before = await snapshot(root);
    tag = `dsrun-${label.replace(/[^\w-]/g, '_')}-${process.pid}-${Date.now()}`;
    const procDir = path.join(queueDir, 'procs', tag);
    fs.mkdirSync(procDir, { recursive: true });
    fs.writeFileSync(path.join(procDir, '.owner'), String(process.pid));
    await killRegistered(root, '--orphans', true);
    const command = ['run', '--standalone', ...(sessionInput ? ['--session', sessionInput] : ['--title', tag]), '--agent', tempAgent ? path.basename(tempAgent, '.md') : agent, ...(model ? ['-m', model] : []), message];
    const started = Date.now();
    const logStream = logFile ? fs.createWriteStream(logFile) : null;
    const r = await run('opencode', command, { cwd: root, timeout,
      env: { ...process.env, DSRUN_TAG: tag, DSRUN_PROCS: path.join(queueDir, 'procs') },
      output: output ? 'inherit' : undefined,
      capture: !output, onData: chunk => logStream?.write(chunk),
    });
    if (logStream) await new Promise(resolve => logStream.end(resolve));
    let session = sessionInput;
    if (!session) {
      const list = await run('opencode', ['session', 'list', '-n', '50'], { cwd: root });
      session = list.stdout.split(/\r?\n/).find(x => x.split('\t')[1] === tag)?.split('\t')[0] || '';
    }
    const after = await snapshot(root);
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(p => before.get(p) !== after.get(p)).sort();
    const foreign = changed.filter(p => others.some(x => globMatch(p, x.glob)));
    const outside = changed.filter(p => !scopes.some(g => globMatch(p, g)) && !foreign.includes(p));
    const elapsed = Math.floor((Date.now() - started) / 1000);
    let receipt = `\n── ds-run: agente=${agent} modo=${readonly ? 'leitura' : 'edicao'} modelo=${model || 'configuração do projeto'} opencode_exit=${r.code} tempo=${elapsed}s sessao=${session}\n`;
    receipt += `── alterados na chamada (${changed.length}):\n${changed.map(p => `   ${p}`).join('\n')}\n`;
    if (foreign.length) receipt += `── de outro agente (${foreign.length}) — informativo:\n${foreign.map(p => `   · ${p}`).join('\n')}\n`;
    if (outside.length) receipt += `── ${readonly ? 'ALTERAÇÃO DURANTE LEITURA' : 'FORA DO ESCOPO'} (${outside.length}) — confira autoria:\n${outside.map(p => `   ! ${p}`).join('\n')}\n`;
    if (output) process.stdout.write(receipt);
    return { code: r.code === 0 && outside.length ? 3 : r.code, receipt, session, stdout: r.stdout, stderr: r.stderr, changed, root };
  } finally {
    if (claimed) fs.rmSync(claim, { force: true });
    if (tempAgent) fs.rmSync(tempAgent, { force: true });
    if (tag) await killRegistered(root, tag, true);
  }
}
if (require.main === module) dsRun(process.argv.slice(2)).then(r => { process.exitCode = r.code; }).catch(e => { console.error(e.message); process.exitCode = e.code || 2; });
module.exports = { dsRun };
