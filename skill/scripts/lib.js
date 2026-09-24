const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

function options(argv, values, flags = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (values.includes(a)) {
      if (!argv[i + 1]) throw Error(`falta valor para ${a}`);
      (out[a] ||= []).push(argv[++i]);
    } else if (flags.includes(a)) out[a] = true;
    else throw Error(`opção inválida: ${a}`);
  }
  return out;
}
const one = (o, key, fallback = '') => o[key]?.at(-1) ?? fallback;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function executable(command) {
  if (process.platform !== 'win32' || path.extname(command)) return command;
  if (['git', 'opencode', 'taskkill'].includes(command)) return `${command}.exe`;
  return command;
}

function run(command, args = [], opts = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', settled = false, timedOut = false, interrupted = 0;
    const env = opts.env || process.env;
    const child = spawn(executable(command), args, {
      cwd: opts.cwd, env, shell: !!opts.shell,
      detached: process.platform !== 'win32',
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', opts.output === 'inherit' ? 'inherit' : 'pipe', opts.output === 'inherit' ? 'inherit' : 'pipe']
    });
    if (opts.input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(opts.input);
    }
    let registration = '';
    if (child.pid && env.DSRUN_TAG && env.DSRUN_PROCS) {
      const dir = path.join(env.DSRUN_PROCS, env.DSRUN_TAG);
      fs.mkdirSync(dir, { recursive: true });
      registration = path.join(dir, String(child.pid));
      fs.writeFileSync(registration, [command, ...args.slice(0, 4)].join(' ').slice(0, 160));
    }
    opts.onStart?.(child.pid);
    child.stdout?.on('data', chunk => { if (opts.capture !== false) stdout = (stdout + chunk).slice(-(opts.maxCapture || 1048576)); opts.onData?.(chunk); });
    child.stderr?.on('data', chunk => { if (opts.capture !== false) stderr = (stderr + chunk).slice(-(opts.maxCapture || 1048576)); opts.onData?.(chunk); });
    const onInt = () => { interrupted = 130; killTree(child.pid); };
    const onTerm = () => { interrupted = 143; killTree(child.pid); };
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    let timer;
    if (opts.timeout) timer = setTimeout(() => {
      timedOut = true;
      process.stderr.write(`── tree-timeout: ${opts.timeout}s estourados, matando árvore do pid ${child.pid}\n`);
      killTree(child.pid);
    }, opts.timeout * 1000);
    child.on('error', error => { stderr += error.message; opts.onData?.(Buffer.from(error.message)); });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
      if (registration) fs.rmSync(registration, { force: true });
      opts.onClose?.(child.pid);
      resolve({ code: timedOut ? 124 : interrupted || (code ?? 1), stdout, stderr });
    });
  });
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    const child = spawn('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

function alive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

async function git(root, ...args) {
  const r = await run('git', ['-C', root, ...args]);
  if (r.code) throw Error(r.stderr.trim() || `git ${args[0]} falhou`);
  return r.stdout.trim();
}

function globMatch(name, pattern) {
  const re = '^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(re).test(name.replaceAll('\\', '/'));
}

async function snapshot(root) {
  const r = await run('git', ['-C', root, 'status', '--porcelain=v1', '-z', '-uall'], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr);
  const parts = r.stdout.split('\0'), result = new Map();
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const name = entry.slice(3).replaceAll('\\', '/');
    if (xy.includes('R') || xy.includes('C')) i++; // git -z: nome de origem segue o destino
    const file = path.join(root, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const h = await run('git', ['-C', root, 'hash-object', '--', name]);
      result.set(name, h.stdout.trim());
    } else result.set(name, 'DELETED');
    const staged = await run('git', ['-C', root, 'ls-files', '--stage', '-z', '--', name]);
    if (staged.code) throw Error(staged.stderr.trim() || `git ls-files falhou: ${name}`);
    result.set(name, `${result.get(name)}\t${staged.stdout}`);
  }
  return result;
}

async function head(root) {
  const r = await run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD']);
  return r.code ? '' : r.stdout.trim();
}

async function committedPaths(root, before, after) {
  if (!after || before === after) return [];
  const args = before
    ? ['log', '--format=', '--name-only', '-z', `${before}..${after}`]
    : ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', after];
  const r = await run('git', ['-C', root, ...args], { maxCapture: 67108864 });
  if (r.code) throw Error(r.stderr.trim() || 'falha ao consultar caminhos dos commits');
  return [...new Set(r.stdout.split('\0').map(x => x.trim()).filter(Boolean))];
}

async function repoPaths(dir) {
  return { root: await git(dir, 'rev-parse', '--show-toplevel'),
    gitDir: await git(dir, 'rev-parse', '--absolute-git-dir') };
}

function tempLog(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, file: path.join(dir, 'output.log') };
}

module.exports = { options, one, sleep, run, killTree, alive, git, globMatch, snapshot, head, committedPaths, repoPaths, tempLog };
