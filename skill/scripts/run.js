#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { options, one } = require('./cli-options.ts');
const { run, alive } = require('./process-runner.ts');
const { globMatch, snapshot, changedPaths, head, committedPaths, repoPaths } = require('./git.ts');
const { killRegistered } = require('./kill.ts');
const { StringDecoder } = require('node:string_decoder');
const { getRunnerAdapter, validateAdapter, feedbackPrompts } = require('./runner-adapter.ts');
const { temporaryAgent, feedbackAgent } = require('./runners/opencode.ts');
const { ROLES, stateDir } = require('./roles.ts');
const { readEnv } = require('./env.ts');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function overlap(a, b) {
  const prefix = x => x.split(/[*?[]/, 1)[0];
  return prefix(a).startsWith(prefix(b)) || prefix(b).startsWith(prefix(a));
}

/**
 * Run action while holding a directory lock. A lock whose owner PID is dead, or that never got an
 * owner PID within ownerlessMs (process died between mkdir and writing the PID), is removed.
 * @param {string} dir
 * @param {() => Promise<any>} action
 * @param {{ attempts?: number, waitMs?: number, ownerlessMs?: number }} [opts]
 */
async function mutex(dir, action, { attempts = 100, waitMs = 200, ownerlessMs = 5000 } = {}) {
  const lock = path.join(dir, 'mutex'), pidFile = path.join(lock, 'pid');
  let acquired = false, waits = 0, removals = 0;
  while (!acquired && waits < attempts) {
    try {
      fs.mkdirSync(lock);
      acquired = true;
      fs.writeFileSync(pidFile, String(process.pid));
    } catch (e) {
      if (acquired || e.code !== 'EEXIST') {
        if (acquired) fs.rmSync(lock, { recursive: true, force: true });
        throw e;
      }
      let owner = 0, ageMs = 0;
      try { owner = Number(fs.readFileSync(pidFile, 'utf8')); } catch {}
      try { ageMs = Date.now() - fs.statSync(lock).mtimeMs; } catch {}
      // Remover trava abandonada não gasta tentativa; o limite de remoções evita laço sem espera.
      if (removals < attempts && ((owner && !alive(owner)) || (!owner && ageMs > ownerlessMs))) {
        fs.rmSync(lock, { recursive: true, force: true });
        removals++;
        continue;
      }
      waits++;
      if (waits < attempts) await sleep(waitMs);
    }
  }
  if (!acquired) throw Error(`mutex preso: ${lock}`);
  try {
    return await action();
  } finally {
    let owner = '';
    try { owner = fs.readFileSync(pidFile, 'utf8'); } catch {}
    if (owner === String(process.pid)) fs.rmSync(lock, { recursive: true, force: true });
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

  const agent = opts.agent || ROLES.implementer;
  if (agent === ROLES.orchestrator) {
    const e = Error(`${ROLES.orchestrator} não é delegável; inicie a sessão com ele`);
    e.code = 2;
    throw e;
  }
  const model = opts.model !== undefined ? opts.model : (readEnv('MODEL') || '');
  const effort = opts.effort !== undefined ? opts.effort : (readEnv('EFFORT') || '');
  const timeout = Number(opts.timeout !== undefined ? opts.timeout : 1800);
  const feedback = opts.feedback || '';
  const scopes = opts.scopes || [];
  const readonly = !!opts.readonly || !!feedback;
  const commitMode = agent === ROLES.committer && !feedback;
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
    ? validateAdapter(opts.runner)
    : getRunnerAdapter(opts.runner || readEnv('RUNNER') || 'opencode', root);

  const agentFile = runner.resolveAgentFile({ root, agent, agentDir: readEnv('AGENT_DIR') });

  const queueDir = stateDir(gitDir), claimDir = path.join(queueDir, 'claims');
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
    tag = `oathbound-${label.replace(/[^\w-]/g, '_')}-${process.pid}-${Date.now()}`;
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
    const display = runner.createDisplay ? runner.createDisplay() : { push: chunk => chunk, flush: () => '' };
    const stdoutTextDecoder = new StringDecoder('utf8');

    const handleStdoutChunk = (chunk) => {
      const str = stdoutTextDecoder.write(chunk);

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

      // Exibição paralela no terminal via contrato createDisplay do adapter
      if (output) {
        const text = display.push(str);
        if (text) process.stdout.write(text);
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
        OATHBOUND_SESSION_TAG: tag,
        OATHBOUND_PROCS_DIR: path.join(queueDir, 'procs'),
        OATHBOUND_AGENT: agent,
        OATHBOUND_SCOPES: JSON.stringify(scopes)
      },
      input: cmdInput,
      capture: true,
      onData: chunk => logStream?.write(chunk),
      onStdout: handleStdoutChunk,
      onStderr: handleStderrChunk
    });

    if (logStream) await new Promise(resolve => logStream.end(resolve));

    if (output) {
      const tail = stdoutTextDecoder.end();
      if (tail) {
        const tailText = display.push(tail);
        if (tailText) process.stdout.write(tailText);
      }
      const flushed = display.flush(r.stdout);
      if (flushed) process.stdout.write(flushed);
    }

    const parsed = runner.parseOutput ? runner.parseOutput(r.stdout) : { text: r.stdout, session: '', usage: null };

    let session = sessionInput || capturedSession || parsed.session || await runner.resolveSession({ root, tag, sessionInput, runResult: r });

    const after = await snapshot(root), afterHead = await head(root);
    const committed = await committedPaths(root, beforeHead, afterHead);
    const changed = changedPaths(before, after, committed);
    const foreign = changed.filter(p => others.some(x => globMatch(p, x.glob)));
    const outside = changed.filter(p => !scopes.some(g => globMatch(p, g)) && !foreign.includes(p));
    const elapsed = Math.floor((Date.now() - started) / 1000);
    const mode = feedback ? 'consulta' : commitMode ? 'git' : readonly ? 'leitura' : 'edicao';

    let receipt = `\n── oathbound run: agente=${agent} runner=${runner.name} modo=${mode} modelo=${model || 'configuração do projeto'}${effort ? ` effort=${effort}` : ''} ${runner.name === 'opencode' ? `opencode_exit=${r.code}` : `exit=${r.code}`} tempo=${elapsed}s sessao=${session}\n`;
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
      outside,
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

/** CLI adapter for oathbound run invocations. */
async function dsRun(args, output = true, logFile = '') {
  const o = options(args, ['-d', '-a', '-m', '-t', '-s', '-f', '-S', '-L', '-Q', '-u', '--runner', '-e', '--effort'], ['-R']);
  const dir = one(o, '-d');
  const agent = one(o, '-a', ROLES.implementer);
  const model = one(o, '-m', readEnv('MODEL') || '');
  const effort = one(o, '--effort') || one(o, '-e') || readEnv('EFFORT') || '';
  const timeout = Number(one(o, '-t', '1800'));
  const feedback = one(o, '-Q');
  const scopes = o['-s'] || [];
  const readonly = !!o['-R'] || !!feedback;
  const session = one(o, '-S');
  const label = one(o, '-L', agent);
  const runner = one(o, '--runner') || one(o, '-u') || readEnv('RUNNER') || 'opencode';

  if (feedback && (!feedbackPrompts[feedback] || !session || scopes.length || o['-f'])) {
    throw Error('uso de -Q: -S <sessão> -Q status|bloqueios|evidencias|entrega, sem -s ou -f');
  }
  if (!dir || (readonly ? scopes.length : !scopes.length)) {
    throw Error('uso: node run.js -d repo (-R | -s glob) [-a agente] [-t segundos] [-u runner] [-e effort] -- mensagem');
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
