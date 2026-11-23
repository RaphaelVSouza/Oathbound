import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

type Cli = 'claude' | 'codex' | 'agy' | 'antigravity-desktop';
type Kind = 'chamada' | 'bloqueio' | 'erro-auditoria' | 'inicio' | 'fim' | 'invocacao';
type Row = Record<string, unknown>;
type Source = { cli: Cli; root: string; path: string; session?: string };
type Event = {
  cli: Cli; tipo: Kind; timestamp: string; agente: string | null;
  sessao: string | null; agente_id: string | null; chamada_id: string | null;
  ferramenta: string | null; atribuicao: 'confirmada' | 'compativel-por-nome' | 'desconhecida';
  sessao_filha?: string;
  correlacao_filha?: 'confirmada' | 'ambigua' | 'sem_evidencia';
  evidencia_filha?: { metodo: 'criacao_adjacente'; fonte: number; linha: number };
  produtor?: { nome: 'oathbound'; versao: string; modo: 'plugin' | null };
  sessao_id?: string;
  tentativa?: true;
  motivo?: string;
  origem: { fonte: number; linha: number; indice?: number };
};

const token = (value: unknown) =>
  typeof value === 'string' && /^[\w.:-]{1,160}$/.test(value) ? value : null;
const record = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function entries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function auditSources(cli: 'claude' | 'codex', root: string): Promise<Source[]> {
  return (await entries(root))
    .filter(file => file.isFile() && /^agent-audit\.jsonl(?:\.\d+)?$/.test(file.name))
    .map(file => ({ cli, root, path: file.name }));
}

async function transcriptSources(cli: 'agy' | 'antigravity-desktop', root: string): Promise<Source[]> {
  const sources: Source[] = [];
  for (const dir of await entries(join(root, 'brain'))) {
    const session = token(dir.name);
    if (!dir.isDirectory() || !session) continue;
    const path = 'brain/' + session + '/.system_generated/logs/transcript.jsonl';
    try {
      if ((await stat(join(root, path))).isFile()) sources.push({ cli, root, path, session });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return sources;
}

function timestamp(value: unknown) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function inPeriod(time: string, localDate: Intl.DateTimeFormat, from: string, to: string) {
  const parts = localDate.formatToParts(new Date(time));
  const day = ['year', 'month', 'day'].map(part => parts.find(p => p.type === part)?.value).join('-');
  return day >= from && day <= to;
}

async function agyCoverage(root: string, transcripts: Source[],
                           localDate: Intl.DateTimeFormat, from: string, to: string) {
  if (!(await entries(root)).some(file => file.isFile() && file.name === 'history.jsonl')) return null;
  const databases = new Set((await entries(join(root, 'conversations')))
    .filter(file => file.isFile() && file.name.endsWith('.db')).map(file => basename(file.name, '.db')));
  const transcriptIds = new Set(transcripts.map(source => source.session));
  const ids = new Set<string>();
  const counts = { lidas: 0, invalidas: 0, sem_data: 0, fora_periodo: 0,
    com_id: 0, sem_id: 0 };
  const stream = createReadStream(join(root, 'history.jsonl'), { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      counts.lidas++;
      let row: unknown;
      try { row = JSON.parse(line.trim()); } catch { counts.invalidas++; continue; }
      if (!record(row)) { counts.invalidas++; continue; }
      const time = new Date(typeof row.timestamp === 'number' ? row.timestamp : NaN);
      if (!Number.isFinite(time.getTime())) { counts.sem_data++; continue; }
      if (!inPeriod(time.toISOString(), localDate, from, to)) { counts.fora_periodo++; continue; }
      const id = token(row.conversationId);
      if (!id) { counts.sem_id++; continue; }
      counts.com_id++;
      ids.add(id);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return {
    arquivo: 'antigravity-cli/history.jsonl', ...counts,
    conversas_distintas: ids.size,
    conversas_com_banco: [...ids].filter(id => databases.has(id)).length,
    conversas_com_transcript: [...ids].filter(id => transcriptIds.has(id)).length,
  };
}

function readAudit(cli: 'claude' | 'codex', row: Row, time: string, origem: Event['origem'],
                   known: ReadonlySet<string>): Event {
  const agente = token(row.agente);
  const ferramenta = token(row.ferramenta);
  let tipo: Kind = 'chamada';
  if (row.erro) tipo = 'erro-auditoria';
  else if (row.bloqueado === true) tipo = 'bloqueio';
  else if (cli === 'codex' && ferramenta === 'SubagentStart') tipo = 'inicio';
  else if (cli === 'codex' && ferramenta === 'SubagentStop') tipo = 'fim';
  const version = record(row.produtor) && row.produtor.nome === 'oathbound'
    ? token(row.produtor.versao) : null;
  const sessionId = token(row.sessao_id);
  const reason = tipo === 'bloqueio' ? token(row.motivo) : null;
  return {
    cli, tipo, timestamp: time, agente, sessao: token(row.sessao),
    agente_id: token(row.agent_id), chamada_id: token(row.tool_use_id), ferramenta, origem,
    atribuicao: agente?.startsWith('oathbound:') && known.has(agente.slice('oathbound:'.length))
      ? 'confirmada' : agente && known.has(agente) ? 'compativel-por-nome' : 'desconhecida',
    ...(version ? { produtor: { nome: 'oathbound' as const, versao: version,
      modo: row.modo_instalacao === 'plugin' ? 'plugin' as const : null } } : {}),
    ...(sessionId ? { sessao_id: sessionId } : {}),
    ...(version && cli === 'claude' && row.tentativa === true && row.modo_instalacao === 'plugin'
      && (tipo === 'chamada' || tipo === 'bloqueio') ? { tentativa: true as const } : {}),
    ...(reason ? { motivo: reason } : {}),
  };
}

function readInvocations(source: Source, row: Row, time: string, origem: Event['origem'],
                         known: ReadonlySet<string>): Event[] {
  if (!Array.isArray(row.tool_calls)) return [];
  const singleCall = row.tool_calls.length === 1;
  return row.tool_calls.flatMap((call: unknown, indice): Event[] => {
    if (!record(call) || call.name !== 'invoke_subagent') return [];
    const name = record(call.args) ? call.args.TypeName : null;
    const agente = token(typeof name === 'string' ? name.trim().replace(/^"(.+)"$/, '$1') : name);
    return [{
      cli: source.cli, tipo: 'invocacao', timestamp: time, agente, sessao: source.session ?? null,
      agente_id: null, chamada_id: token(call.id), ferramenta: 'invoke_subagent',
      correlacao_filha: singleCall ? 'sem_evidencia' : 'ambigua',
      atribuicao: agente && known.has(agente) ? 'compativel-por-nome' : 'desconhecida',
      origem: { ...origem, indice },
    }];
  });
}

function createdChild(row: Row) {
  if (row.source !== 'MODEL' || row.type !== 'GENERIC' || typeof row.content !== 'string') return null;
  const match = /^Created the following subagent:\s*\{\s*"conversationId"\s*:\s*"([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})"/im
    .exec(row.content);
  return match?.[1].toLowerCase() ?? null;
}

async function extract(source: Source, id: number, groups: Map<Cli, Event[]>,
                       known: ReadonlySet<string>, localDate: Intl.DateTimeFormat, from: string, to: string) {
  const counts = { lidas: 0, vazias: 0, invalidas: 0, sem_data: 0, fora_periodo: 0,
    sem_evento: 0, com_evento: 0, eventos: 0 };
  const stream = createReadStream(join(source.root, source.path), { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const isAudit = source.cli === 'claude' || source.cli === 'codex';
  const seenChildren = new Set<string>();
  let pending: { event: Event; step: number } | undefined;
  try {
    for await (const raw of lines) {
      const previous = pending;
      pending = undefined;
      counts.lidas++;
      const line = raw.trim();
      if (!line) { counts.vazias++; continue; }
      let row: unknown;
      try { row = JSON.parse(line); } catch { counts.invalidas++; continue; }
      if (!record(row)) { counts.invalidas++; continue; }
      if (!isAudit) {
        const child = createdChild(row);
        if (child && !seenChildren.has(child)) {
          seenChildren.add(child);
          if (previous && row.step_index === previous.step + 1 && child !== source.session) {
            previous.event.sessao_filha = child;
            previous.event.correlacao_filha = 'confirmada';
            previous.event.evidencia_filha = { metodo: 'criacao_adjacente', fonte: id, linha: counts.lidas };
          }
        }
      }
      const time = timestamp(isAudit ? row.ts : row.created_at);
      if (!time) { counts.sem_data++; continue; }
      if (!inPeriod(time, localDate, from, to)) { counts.fora_periodo++; continue; }
      const origem = { fonte: id, linha: counts.lidas };
      if (isAudit && typeof row.ferramenta !== 'string' && !row.erro) { counts.sem_evento++; continue; }
      const events = source.cli === 'claude' || source.cli === 'codex'
        ? [readAudit(source.cli, row, time, origem, known)]
        : readInvocations(source, row, time, origem, known);
      if (events.length === 1 && events[0].correlacao_filha === 'sem_evidencia' &&
          typeof row.step_index === 'number' && Number.isSafeInteger(row.step_index)) {
        pending = { event: events[0], step: row.step_index };
      }
      if (!events.length) { counts.sem_evento++; continue; }
      counts.com_evento++;
      counts.eventos += events.length;
      groups.get(source.cli)!.push(...events);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return { id, cli: source.cli, arquivo: source.path, ...counts };
}

function countBy(values: (string | null)[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value ?? '(ausente)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function summarize(cli: Cli, events: Event[]) {
  const calls = events.filter(event => event.tipo === 'chamada');
  const blocks = events.filter(event => event.tipo === 'bloqueio');
  const key = (event: Event) => event.sessao && event.agente_id && event.chamada_id
    ? JSON.stringify([event.sessao, event.agente_id, event.chamada_id]) : null;
  const callIds = new Set(calls.map(key).filter(id => id !== null));
  const blockIds = new Set(blocks.map(key).filter(id => id !== null));
  const orphans = [...blockIds].filter(id => !callIds.has(id)).length;
  const withoutCallId = calls.filter(event => !key(event)).length;
  const withoutBlockId = blocks.filter(event => !key(event)).length;
  const canComputeRate = cli === 'claude' && callIds.size > 0 &&
    !withoutCallId && !withoutBlockId && !orphans;
  return {
    eventos: events.length,
    por_tipo: countBy(events.map(event => event.tipo)),
    por_agente: countBy(events.map(event => event.agente)),
    por_sessao: countBy(events.map(event => event.sessao)),
    por_ferramenta: countBy(events.map(event => event.ferramenta)),
    por_atribuicao: countBy(events.map(event => event.atribuicao)),
    por_versao_produtor: countBy(events.map(event => event.produtor?.versao ?? null)),
    por_modo_instalacao: countBy(events.map(event => event.produtor?.modo ?? null)),
    sem_agente: events.filter(event => !event.agente).length,
    sem_sessao: events.filter(event => !event.sessao).length,
    invocacoes_sem_id: events.filter(event => event.tipo === 'invocacao' && !event.chamada_id).length,
    ...(cli === 'agy' || cli === 'antigravity-desktop' ? {
      correlacao_sessoes_filhas: countBy(events.map(event => event.correlacao_filha ?? null)),
    } : {}),
    ...(cli === 'claude' ? { decisoes_plugin: summarizePluginDecisions(events) } : {}),
    correlacao_bloqueios: cli === 'claude' || cli === 'codex' ? {
      chamadas_distintas_identificadas: callIds.size,
      bloqueios_distintos_identificados: blockIds.size,
      bloqueios_identificados_sem_chamada_na_janela: orphans,
      chamadas_sem_chave: withoutCallId,
      bloqueios_sem_chave: withoutBlockId,
      denominador_taxa: canComputeRate ? callIds.size : null,
      taxa: canComputeRate ? blockIds.size / callIds.size : null,
    } : null,
  };
}

function summarizePluginDecisions(events: Event[]) {
  const decisions = events.filter(event => event.tentativa);
  const keyed = new Map<string, Set<Kind>>();
  let unkeyed = 0;
  for (const event of decisions) {
    if (!event.sessao_id || !event.agente_id || !event.chamada_id) {
      unkeyed++;
      continue;
    }
    const key = JSON.stringify([event.sessao_id, event.agente_id, event.chamada_id]);
    const kinds = keyed.get(key) ?? new Set<Kind>();
    kinds.add(event.tipo);
    keyed.set(key, kinds);
  }
  const kinds = [...keyed.values()];
  const conflicting = kinds.filter(values => values.size > 1).length;
  const blocked = kinds.filter(values => values.size === 1 && values.has('bloqueio')).length;
  const denominator = keyed.size && !unkeyed && !conflicting ? keyed.size : null;
  return {
    registros: decisions.length,
    sem_chave: unkeyed,
    chaves_distintas: keyed.size,
    registros_duplicados: decisions.length - unkeyed - kinds.reduce((total, values) => total + values.size, 0),
    chaves_conflitantes: conflicting,
    bloqueios_distintos: blocked,
    denominador_taxa: denominator,
    taxa: denominator === null ? null : blocked / denominator,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      inicio: { type: 'string' }, fim: { type: 'string' }, saida: { type: 'string' },
      fuso: { type: 'string', default: 'America/Sao_Paulo' },
      claude: { type: 'string' }, codex: { type: 'string' }, gemini: { type: 'string' },
    },
  });
  const { inicio, fim, saida, fuso } = values;
  const validDate = (day?: string): day is string => !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    timestamp(day + 'T00:00:00Z')?.slice(0, 10) === day;
  if (!validDate(inicio) || !validDate(fim) || inicio > fim || !saida) {
    throw new Error('Use --inicio YYYY-MM-DD --fim YYYY-MM-DD --saida <new directory>.');
  }
  const localDate = new Intl.DateTimeFormat('en', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const home = homedir();
  const gemini = resolve(values.gemini ?? join(home, '.gemini'));
  const repo = resolve(import.meta.dirname, '..');
  const known = new Set((await entries(join(repo, 'agy', 'config', 'agents')))
    .filter(file => file.isFile() && file.name.endsWith('.md')).map(file => basename(file.name, '.md')));
  const roots = {
    claude: resolve(values.claude ?? process.env.AGENT_AUDIT_DIR ?? join(home, '.claude', 'state')),
    codex: resolve(values.codex ?? join(process.env.CODEX_HOME ?? join(home, '.codex'), 'state')),
  };
  const sources = [
    ...await auditSources('claude', roots.claude),
    ...await auditSources('codex', roots.codex),
    ...await transcriptSources('agy', join(gemini, 'antigravity-cli')),
    ...await transcriptSources('antigravity-desktop', join(gemini, 'antigravity')),
    ...await transcriptSources('antigravity-desktop', join(gemini, 'antigravity-ide')),
  ].sort((a, b) => a.cli.localeCompare(b.cli) || basename(a.root).localeCompare(basename(b.root)) ||
    a.path.localeCompare(b.path));
  if (!sources.length) throw new Error('No sources found in the specified directories.');
  const groups = new Map<Cli, Event[]>([
    ['claude', []], ['codex', []], ['agy', []], ['antigravity-desktop', []],
  ]);
  const inventory = [];
  for (const source of sources) {
    inventory.push({
      ...await extract(source, inventory.length + 1, groups, known, localDate, inicio, fim),
      ...(source.session ? { raiz_antigravity: basename(source.root) } : {}),
    });
  }
  const events = [...groups.values()].flat().sort((a, b) => a.timestamp.localeCompare(b.timestamp) ||
    a.origem.fonte - b.origem.fonte || a.origem.linha - b.origem.linha ||
    (a.origem.indice ?? 0) - (b.origem.indice ?? 0));
  const metrics = {
    versao_esquema: 1,
    versao_extrator: (await readFile(join(repo, 'VERSION'), 'utf8')).trim(),
    periodo: { inicio, fim, fuso },
    fontes: inventory,
    cobertura_historico_agy: await agyCoverage(join(gemini, 'antigravity-cli'),
      sources.filter(source => source.cli === 'agy'), localDate, inicio, fim),
    por_cli: Object.fromEntries([...groups].map(([cli, rows]) => [cli, summarize(cli, rows)])),
  };
  await mkdir(saida);
  await writeFile(join(saida, 'eventos.jsonl'), events.map(event => JSON.stringify(event) + '\n').join(''));
  await writeFile(join(saida, 'metricas.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(`${events.length} events from ${sources.length} files.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
