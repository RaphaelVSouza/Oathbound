#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { options, one } = require('./cli-options');
const { run, alive } = require('./process-runner');
const { globMatch, snapshot, changedPaths, head, committedPaths, repoPaths } = require('./git');
const { killRegistered } = require('./ds-kill');
const { getRunnerAdapter, feedbackPrompts } = require('./runner-adapter');
const { temporaryAgent, feedbackAgent } = require('./runners/opencode');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function overlap(a, b) {
  const prefix = x => x.split(/[*?[]/, 1)[0];
  return prefix(a).startsWith(prefix(b)) || prefix(b).startsWith(prefix(a));
}

async function mutex(dir, action) {
  const lock = path.join(dir, 'mutex');
  for (let n = 0; n < 100; n++) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
      break;
    } catch {
      const owner = Number(fs.existsSync(path.join(lock, 'pid')) ? fs.readFileSync(path.join(lock, 'pid'), 'utf8') : 0);
      if (owner && !alive(owner)) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (n === 99) throw Error(`mutex preso: ${lock}`);
      await sleep(200);
    }
  }
  try {
    return await action();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/**
 * @typedef {{
 *   repo: string,
 *   message: string,
 *   runner?: string | any,
 *   agent?: string,
 *   model?: string,
 *   timeout?: number,
 *   scopes?: string[],
 *   readonly?: boolean,
 *   feedback?: string,
 *   session?: string,
 *   label?: string,
 *   output?: boolean,
 *   logFile?: string
 * }} SessionOptions
 *
 * @typedef {{
 *   code: number,
 *   receipt: string,
 *   session: string,
 *   stdout: string,
 *   stderr: string,
 *   changed: string[],
 *   root: string
 * }} SessionResult
 */

/**
 * Execute an agent session with scope claim locking and before/after Git audit.
 * @param {SessionOptions} opts
 * @returns {Promise<SessionResult>}
 */
async function runSession(opts = {}) {
  const dir = opts.repo;
  if (!dir) throw Error('repositório obrigatório');

  const agent = opts.agent || 'ds-runner';
  const model = opts.model !== undefined ? opts.model : (process.env.GOVKIT_MODEL || '');
  const effort = opts.effort !== undefined ? opts.effort : (process.env.GOVKIT_EFFORT || '');
  const timeout = Number(opts.timeout !== undefined ? opts.timeout : 1800);
  const feedback = opts.feedback || '';
  const scopes = opts.scopes || [];
  const readonly = !!opts.readonly || !!feedback;
  const commitMode = agent === 'ds-committer' && !feedback;
  const sessionInput = opts.session || '';
  const label = opts.label || agent;
  const output = opts.output !== false;
  const logFile = opts.logFile || '';

  if (feedback && (!feedbackPrompts[feedback] || !sessionInput || scopes.length)) {
    throw Error('uso de feedback: sessão obrigatória (-S), sem escopos de escrita (-s)');
  }
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw Error('timeout inválido: informe um número inteiro positivo de segundos');
  }
  if (readonly ? scopes.length : !scopes.length) {
    throw Error('modo somente leitura proíbe escopos; modo de edição exige ao menos um escopo');
  }

  let message = opts.message || '';
  if (feedback) {
    message = `${feedbackPrompts[feedback]}${message.trim() ? `\nPergunta adicional: ${message}` : ''}`;
  }
  if (!message.trim()) throw Error('falta mensagem');

  const { root, gitDir } = await repoPaths(dir);
  const runner = typeof opts.runner === 'object' && opts.runner
    ? opts.runner
    : getRunnerAdapter(opts.runner || process.env.GOVKIT_RUNNER || 'opencode', root);

  const agentFile = runner.resolveAgentFile({ root, agent, agentDir: process.env.GOVKIT_AGENT_DIR });

  const queueDir = path.join(gitDir, 'ds-queue'), claimDir = path.join(queueDir, 'claims');
  fs.mkdirSync(claimDir, { recursive: true });
  const others = [], claim = path.join(claimDir, `${process.pid}.claim`);
  let claimed = false, tempAgent = '', tag = '', cleanupHandler = null;

  try {
    if (!readonly) {
      await mutex(queueDir, () => {
        const claimFiles = typeof fs.globSync === 'function'
          ? fs.globSync('*.claim', { cwd: claimDir })
          : fs.readdirSync(claimDir).filter(x => x.endsWith('.claim'));
        for (const file of claimFiles) {
          const pid = Number(file.slice(0, -6)), target = path.join(claimDir, file);
          if (!alive(pid)) { fs.rmSync(target, { force: true }); continue; }
          const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/);
          const otherLabel = lines.find(x => x.startsWith('label='))?.slice(6) || file;
          for (const glob of lines.filter(x => x.startsWith('glob=')).map(x => x.slice(5))) {
            for (const mine of scopes) {
              if (commitMode || overlap(mine, glob)) {
                const e = Error(`conflito de posse — '${mine}' sobrepõe '${glob}' de ${otherLabel} (pid ${pid})`);
                e.code = 4;
                throw e;
              }
            }
            others.push({ glob, label: otherLabel });
          }
        }
        fs.writeFileSync(claim, [`label=${label}`, `agent=${agent}`, `start=${Date.now()}`, ...(commitMode ? ['glob=*'] : scopes.map(g => `glob=${g}`))].join('\n'));
        claimed = true;
      });
    }

    const prepared = runner.prepareAgent({ agentFile, agent, others, feedback, scopes, readonly });
    tempAgent = prepared.tempAgent || '';
    cleanupHandler = prepared.cleanup || null;
    if (prepared.promptPrefix) {
      message = `${message}\n${prepared.promptPrefix}`;
    }

    const before = await snapshot(root), beforeHead = await head(root);
    tag = `dsrun-${label.replace(/[^\w-]/g, '_')}-${process.pid}-${Date.now()}`;
    const procDir = path.join(queueDir, 'procs', tag);
    fs.mkdirSync(procDir, { recursive: true });
    fs.writeFileSync(path.join(procDir, '.owner'), String(process.pid));
    await killRegistered(root, '--orphans', true);

    const { command, args: cmdArgs, env: cmdEnv, input: cmdInput } = runner.buildCommand({
      root,
      agent,
      agentFile,
      tempAgent,
      model,
      effort,
      message,
      session: sessionInput,
      tag,
      promptPrefix: prepared.promptPrefix || '',
      readonly,
      scopes
    });

    const started = Date.now();
    const logStream = logFile ? fs.createWriteStream(logFile) : null;

    let capturedSession = '';
    let earlyBuffer = '';
    let codexLineBuffer = '';

    const handleStdoutChunk = (chunk) => {
      const str = chunk.toString();

      // Guarda o id de sessão assim que aparece no stream, evitando perda por corte de maxCapture
      if (!capturedSession && !sessionInput) {
        earlyBuffer += str;
        try {
          const early = runner.parseOutput ? runner.parseOutput(earlyBuffer) : null;
          if (early && early.session) {
            capturedSession = early.session;
            earlyBuffer = '';
          } else if (earlyBuffer.length > 65536) {
            earlyBuffer = earlyBuffer.slice(-8192);
          }
        } catch {}
      }

      // Exibição paralela no terminal
      if (output) {
        if (runner.name === 'codex') {
          codexLineBuffer += str;
          const lines = codexLineBuffer.split(/\r?\n/);
          codexLineBuffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              try {
                const ev = JSON.parse(trimmed);
                if (ev.item && (ev.item.type === 'agent_message' || ev.item.type === 'message') && typeof ev.item.text === 'string') {
                  process.stdout.write(ev.item.text + '\n');
                } else if (ev.type === 'agent_message' && typeof ev.text === 'string') {
                  process.stdout.write(ev.text + '\n');
                }
              } catch {
                process.stdout.write(line + '\n');
              }
            } else {
              process.stdout.write(line + '\n');
            }
          }
        } else if (runner.name === 'agy') {
          // AGY com --output-format json gera objeto estruturado exibido no fechamento
        } else {
          process.stdout.write(chunk);
        }
      }
    };

    const handleStderrChunk = (chunk) => {
      if (output) {
        process.stderr.write(chunk);
      }
    };

    const r = await run(command, cmdArgs, {
      cwd: root, timeout,
      env: {
        ...process.env,
        ...(cmdEnv || {}),
        DSRUN_TAG: tag,
        DSRUN_PROCS: path.join(queueDir, 'procs'),
        GOVKIT_AGENT: agent,
        GOVKIT_SCOPES: JSON.stringify(scopes)
      },
      input: cmdInput,
      capture: true,
      onData: chunk => logStream?.write(chunk),
      onStdout: handleStdoutChunk,
      onStderr: handleStderrChunk
    });

    if (logStream) await new Promise(resolve => logStream.end(resolve));

    if (output && runner.name === 'codex' && codexLineBuffer.trim()) {
      const trimmed = codexLineBuffer.trim();
      if (!trimmed.startsWith('{')) {
        process.stdout.write(trimmed + '\n');
      }
    }

    const parsed = runner.parseOutput ? runner.parseOutput(r.stdout) : { text: r.stdout, session: '', usage: null };

    if (output && runner.name === 'agy' && parsed.text && parsed.text !== r.stdout) {
      process.stdout.write(parsed.text + '\n');
    }

    let session = sessionInput || capturedSession || parsed.session || await runner.resolveSession({ root, tag, sessionInput, runResult: r });

    const after = await snapshot(root), afterHead = await head(root);
    const committed = await committedPaths(root, beforeHead, afterHead);
    const changed = changedPaths(before, after, committed);
    const foreign = changed.filter(p => others.some(x => globMatch(p, x.glob)));
    const outside = changed.filter(p => !scopes.some(g => globMatch(p, g)) && !foreign.includes(p));
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const mode = feedback ? 'consulta' : commitMode ? 'git' : readonly ? 'leitura' : 'edicao';

    let receipt = `\n── ds-run: agente=${agent} runner=${runner.name} modo=${mode} modelo=${model || 'configuração do projeto'}${effort ? ` effort=${effort}` : ''} ${runner.name === 'opencode' ? `opencode_exit=${r.code}` : `exit=${r.code}`} tempo=${elapsed}s sessao=${session}\n`;
    if (parsed.usage) {
      const u = parsed.usage;
      const parts = [];
      const inTokens = u.input_tokens ?? u.prompt_tokens;
      const cachedTokens = u.cached_input_tokens ?? u.cache_read_input_tokens;
      const outTokens = u.output_tokens ?? u.completion_tokens;
      if (inTokens !== undefined) parts.push(`in=${inTokens}`);
      if (cachedTokens !== undefined) parts.push(`cached=${cachedTokens}`);
      if (outTokens !== undefined) parts.push(`out=${outTokens}`);
      if (parts.length) {
        receipt += `── telemetria: ${parts.join(' ')}\n`;
      }
    }
    receipt += `── alterados na chamada (${changed.length}):\n${changed.map(p => `   ${p}`).join('\n')}\n`;
    if (beforeHead !== afterHead) receipt += `── HEAD: ${beforeHead || '(sem commit)'} → ${afterHead || '(sem commit)'}; arquivos commitados=${committed.length}\n`;
    if (foreign.length) receipt += `── de outro agente (${foreign.length}) — informativo:\n${foreign.map(p => `   · ${p}`).join('\n')}\n`;
    if (outside.length) receipt += `── ${readonly ? 'ALTERAÇÃO DURANTE LEITURA' : 'FORA DO ESCOPO'} (${outside.length}) — confira autoria:\n${outside.map(p => `   ! ${p}`).join('\n')}\n`;

    if (output) process.stdout.write(receipt);

    return {
      code: r.code === 0 && outside.length ? 3 : r.code,
      receipt,
      session,
      stdout: parsed.text,
      rawStdout: r.stdout,
      stderr: r.stderr,
      usage: parsed.usage || null,
      changed,
      root
    };
  } finally {
    if (claimed) fs.rmSync(claim, { force: true });
    if (tempAgent) fs.rmSync(tempAgent, { force: true });
    if (cleanupHandler) {
      try { await cleanupHandler(); } catch {}
    }
    if (tag) await killRegistered(root, tag, true);
  }
}

/** CLI adapter for ds-run invocations. */
async function dsRun(args, output = true, logFile = '') {
  const o = options(args, ['-d', '-a', '-m', '-t', '-s', '-f', '-S', '-L', '-Q', '-u', '--runner', '-e', '--effort'], ['-R']);
  const dir = one(o, '-d');
  const agent = one(o, '-a', 'ds-runner');
  const model = one(o, '-m', process.env.GOVKIT_MODEL || '');
  const effort = one(o, '--effort') || one(o, '-e') || process.env.GOVKIT_EFFORT || '';
  const timeout = Number(one(o, '-t', '1800'));
  const feedback = one(o, '-Q');
  const scopes = o['-s'] || [];
  const readonly = !!o['-R'] || !!feedback;
  const session = one(o, '-S');
  const label = one(o, '-L', agent);
  const runner = one(o, '--runner') || one(o, '-u') || process.env.GOVKIT_RUNNER || 'opencode';

  if (feedback && (!feedbackPrompts[feedback] || !session || scopes.length || o['-f'])) {
    throw Error('uso de -Q: -S <sessão> -Q status|bloqueios|evidencias|entrega, sem -s ou -f');
  }
  if (!dir || (readonly ? scopes.length : !scopes.length)) {
    throw Error('uso: node ds-run.js -d repo (-R | -s glob) [-a agente] [-t segundos] [-u runner] [-e effort] -- mensagem');
  }

  const message = one(o, '-f') ? fs.readFileSync(one(o, '-f'), 'utf8') : o._.join(' ');

  return runSession({
    repo: dir,
    runner,
    message,
    agent,
    model,
    effort,
    timeout,
    scopes,
    readonly,
    feedback,
    session,
    label,
    output,
    logFile
  });
}

if (require.main === module) {
  dsRun(process.argv.slice(2)).then(r => {
    process.exitCode = r.code;
  }).catch(e => {
    console.error(e.message);
    process.exitCode = e.code || 2;
  });
}

module.exports = {
  runSession,
  dsRun,
  overlap,
  mutex,
  temporaryAgent,
  feedbackAgent,
  feedbackPrompts,
  getRunnerAdapter
};
