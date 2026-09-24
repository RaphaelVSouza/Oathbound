const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** @typedef {{ code: number, stdout: string, stderr: string }} ProcessResult */
/** @typedef {{ cwd?: string, env?: Record<string, string|undefined>, shell?: boolean, input?: string|Buffer, output?: 'inherit', capture?: boolean, maxCapture?: number, timeout?: number, onStart?: (pid?: number) => void, onData?: (chunk: Buffer) => void, onClose?: (pid?: number) => void }} RunOptions */

function executable(command) {
  if (process.platform !== 'win32' || path.extname(command)) return command;
  if (['git', 'opencode', 'taskkill'].includes(command)) return `${command}.exe`;
  return command;
}

/**
 * Run a child process and resolve after it closes. Timeout and signals request process tree termination.
 * Output is captured up to maxCapture unless capture is false or output is inherited.
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} opts
 * @returns {Promise<ProcessResult>} Exit code uses 124 for timeout and 130/143 for signals.
 */
function run(command, args = [], opts = {}) {
  if (typeof command !== 'string' || !command) throw Error('comando do processo deve ser uma string não vazia');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw Error('argumentos do processo devem ser strings');
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw Error('opções do processo devem ser um objeto');
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

/** Terminate a process and its descendants when pid is a valid child PID. @param {number} pid */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    const child = spawn('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

/** Check whether a positive integer PID appears to be running. @param {number|string} pid @returns {boolean} */
function alive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

module.exports = { run, killTree, alive };
