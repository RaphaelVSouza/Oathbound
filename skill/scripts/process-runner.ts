const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  shell?: boolean;
  input?: string | Buffer;
  output?: 'inherit';
  capture?: boolean;
  maxCapture?: number;
  timeout?: number;
  onStart?: (pid?: number) => void;
  onData?: (chunk: Buffer) => void;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
  onClose?: (pid?: number) => void;
}

interface ResolvedCommand {
  command: string;
  prefix: string[];
}

/**
 * Resolve a Windows command without a shell. Binaries (.exe/.com) are left to libuv's own PATH search;
 * npm shims (.cmd/.bat) are parsed and replaced by the program they call, because spawning a .cmd
 * requires cmd.exe and cmd.exe cannot receive arbitrary arguments (&, |, quotes, %) safely.
 */
function resolveCommand(
  command: string,
  { platform = process.platform, env = process.env }: { platform?: string; env?: Record<string, string | undefined> } = {}
): ResolvedCommand {
  const same: ResolvedCommand = { command, prefix: [] };
  if (platform !== 'win32') return same;
  const ext = path.extname(command).toLowerCase();
  if (ext === '.cmd' || ext === '.bat') return resolveShim(command);
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH');
  const dirs = String((key && env[key]) || '').split(';').map(d => d.trim().replace(/^"|"$/g, '')).filter(Boolean);
  const hit = (suffixes: string[]) => dirs.flatMap(d => suffixes.map(s => path.join(d, command + s))).find(f => isFile(f));
  if (ext || /[\\/]/.test(command)) {
    if (!/[\\/]/.test(command) && ['.com', '.exe'].includes(ext)) {
      const executable = dirs.map(d => path.join(d, command)).find(isFile);
      if (executable) return { command: executable, prefix: [] };
    }
    return same;
  }
  const executable = hit(['.com', '.exe']);
  if (executable) return { command: executable, prefix: [] };
  const shim = hit(['.cmd', '.bat']);
  return shim ? resolveShim(shim) : same;
}

function isFile(file: string): boolean {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

/**
 * Read an npm cmd-shim and return the program it runs: the target itself when it is a binary,
 * or the current Node with the target script as first argument.
 */
function resolveShim(file: string): ResolvedCommand {
  const text = fs.readFileSync(file, 'utf8');
  const matches = [...text.matchAll(/"%~?dp0%?\\([^"%]+)"\s+%\*/g)];
  if (!matches.length) {
    throw Error(`${file} não é um shim npm reconhecível; sem shell não há execução segura de .cmd/.bat — aponte o runner para o .exe ou para o script Node real`);
  }
  const target = path.join(path.dirname(file), ...matches.at(-1)![1].split('\\'));
  if (!isFile(target)) throw Error(`shim ${file} aponta para arquivo ausente: ${target}`);
  const ext = path.extname(target).toLowerCase();
  if (ext === '.exe' || ext === '.com') return { command: target, prefix: [] };
  const firstLine = fs.readFileSync(target, 'utf8').split('\n', 1)[0];
  if (['.js', '.cjs', '.mjs'].includes(ext) || /^#!.*\bnode\b/.test(firstLine)) return { command: process.execPath, prefix: [target] };
  throw Error(`shim ${file} executa ${target}, que não é binário nem script Node; aponte o runner para o executável real`);
}

/**
 * Run a child process and resolve after it closes. Timeout and signals request process tree termination.
 * Output is captured up to maxCapture unless capture is false or output is inherited.
 */
function run(command: string, args: string[] = [], opts: RunOptions = {}): Promise<ProcessResult> {
  if (typeof command !== 'string' || !command) throw Error('comando do processo deve ser uma string não vazia');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw Error('argumentos do processo devem ser strings');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw Error('opções do processo devem ser um objeto');
  const { promise, resolve } = Promise.withResolvers<ProcessResult>();
  let stdout = '', stderr = '', settled = false, timedOut = false, interrupted = 0;
  const stdoutDecoder = new StringDecoder('utf8');
  const stderrDecoder = new StringDecoder('utf8');
  const env: any = opts.env || process.env;
  const autoShell = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)(\.cmd)?$/i.test(command);
  const shell = opts.shell !== undefined ? !!opts.shell : autoShell;
  const resolved = shell ? { command, prefix: [] } : resolveCommand(command, { env });
  const child = spawn(resolved.command, [...resolved.prefix, ...args], {
    cwd: opts.cwd, env, shell,
    detached: process.platform !== 'win32',
    stdio: [opts.input === undefined ? 'ignore' : 'pipe', opts.output === 'inherit' ? 'inherit' : 'pipe', opts.output === 'inherit' ? 'inherit' : 'pipe']
  });
  if (opts.input !== undefined) {
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input);
  }
  let registration = '';
  if (child.pid && env.OATHBOUND_SESSION_TAG && env.OATHBOUND_PROCS_DIR) {
    const dir = path.join(env.OATHBOUND_PROCS_DIR, env.OATHBOUND_SESSION_TAG);
    fs.mkdirSync(dir, { recursive: true });
    registration = path.join(dir, String(child.pid));
    fs.writeFileSync(registration, [command, ...args.slice(0, 4)].join(' ').slice(0, 160));
  }
  opts.onStart?.(child.pid);
  child.stdout?.on('data', (chunk: Buffer) => {
    if (opts.capture !== false) stdout = (stdout + stdoutDecoder.write(chunk)).slice(-(opts.maxCapture || 1048576));
    opts.onData?.(chunk);
    opts.onStdout?.(chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    if (opts.capture !== false) stderr = (stderr + stderrDecoder.write(chunk)).slice(-(opts.maxCapture || 1048576));
    opts.onData?.(chunk);
    opts.onStderr?.(chunk);
  });
  const killChild = () => { try { child.kill('SIGKILL'); } catch {} };
  const onInt = () => { interrupted = 130; killTree(child.pid!, killChild); };
  const onTerm = () => { interrupted = 143; killTree(child.pid!, killChild); };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  let timer: any;
  if (opts.timeout) timer = setTimeout(() => {
    timedOut = true;
    process.stderr.write(`── tree-timeout: ${opts.timeout}s estourados, matando árvore do pid ${child.pid}\n`);
    killTree(child.pid!, killChild);
  }, opts.timeout * 1000);
  child.on('error', (error: Error) => { stderr += error.message; opts.onData?.(Buffer.from(error.message)); });
  child.on('close', (code: number | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    if (registration) fs.rmSync(registration, { force: true });
    if (opts.capture !== false) {
      stdout = (stdout + stdoutDecoder.end()).slice(-(opts.maxCapture || 1048576));
      stderr = (stderr + stderrDecoder.end()).slice(-(opts.maxCapture || 1048576));
    }
    opts.onClose?.(child.pid);
    resolve({ code: timedOut ? 124 : interrupted || (code ?? 1), stdout, stderr });
  });
  return promise;
}

/** Terminate a process and its descendants when pid is a valid child PID. */
function killTree(pid?: number, fallback?: () => void): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const taskkill = resolveCommand('taskkill.exe');
    const killer = spawn(taskkill.command, ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    let finished = false;
    const fallbackOnce = () => {
      if (finished) return;
      finished = true;
      fallback?.();
    };
    killer.on('error', fallbackOnce);
    killer.on('close', code => { if (code !== 0) fallbackOnce(); });
  } else {
    try { (process as any).kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

/** Check whether a positive integer PID appears to be running. */
function alive(pid: number | string): boolean {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

module.exports = { run, killTree, alive, resolveCommand };
