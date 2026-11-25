import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('Claude plugin decision rates count denied attempts and require complete, consistent keys', t => {
  const repo = resolve(import.meta.dirname, '..');
  const root = mkdtempSync(join(repo, 'test/.audit-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const claude = join(root, 'claude');
  mkdirSync(claude);
  const base = {
    ts: '2026-11-20T15:00:00Z',
    agente: 'oathbound:scout',
    agent_id: 'sub-1',
    sessao: 'parent',
    sessao_id: 'parent-session',
    ferramenta: 'Read',
    tentativa: true,
    modo_instalacao: 'plugin',
    produtor: { nome: 'oathbound', versao: '0.50.0-alpha.41' },
  };
  const allow = { ...base, tool_use_id: 'allowed' };
  const deny = { ...base, tool_use_id: 'denied', bloqueado: true };
  const write = (name: string, rows: unknown[]) =>
    writeFileSync(join(claude, name), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  const extract = (name: string) => {
    const output = join(root, name);
    execFileSync(process.execPath, [join(repo, 'tools/extract-audit.ts'),
      '--inicio', '2026-11-20', '--fim', '2026-11-20', '--saida', output,
      '--claude', claude, '--codex', join(root, 'codex'), '--gemini', join(root, 'gemini')]);
    return JSON.parse(readFileSync(join(output, 'metricas.json'), 'utf8')).por_cli.claude;
  };
  write('agent-audit.jsonl.1', [deny]);
  write('agent-audit.jsonl', [allow, deny, { ...base, tentativa: undefined }]);
  const complete = extract('complete');
  assert.deepEqual(complete.por_tipo, { chamada: 2, bloqueio: 2 });
  assert.deepEqual(complete.decisoes_plugin, {
    registros: 3, sem_chave: 0, chaves_distintas: 2, registros_duplicados: 1,
    chaves_conflitantes: 0, bloqueios_distintos: 1, denominador_taxa: 2, taxa: 0.5,
  });
  write('agent-audit.jsonl', [allow, { ...allow, bloqueado: true }, base]);
  const incomplete = extract('incomplete').decisoes_plugin;
  assert.equal(incomplete.chaves_conflitantes, 1);
  assert.equal(incomplete.sem_chave, 1);
  assert.equal(incomplete.taxa, null);
});

test('extract-audit separates producer cohorts and correlates single-subagent mixed batches', t => {
  const repo = resolve(import.meta.dirname, '..');
  const root = mkdtempSync(join(repo, 'test/.audit-mixed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const claude = join(root, 'claude');
  const agyTranscript = join(root, 'gemini', 'antigravity-cli', 'brain', 'parent-1', '.system_generated', 'logs');
  mkdirSync(claude, { recursive: true });
  mkdirSync(agyTranscript, { recursive: true });

  const claudeRows = [
    // Legacy unkeyed row
    { ts: '2026-11-20T15:00:00Z', agente: 'scout', agent_id: 'a0', sessao: 's0', ferramenta: 'Read', alvo: 'x.ts' },
    // Keyed non-plugin producer rows
    { ts: '2026-11-20T15:01:00Z', agente: 'scout', agent_id: 'a1', sessao: 's1', ferramenta: 'Read', tool_use_id: 'k1', produtor: { nome: 'oathbound', versao: '0.50.0-alpha.54' } },
    { ts: '2026-11-20T15:02:00Z', agente: 'scout', agent_id: 'a1', sessao: 's1', ferramenta: 'Read', tool_use_id: 'k2', produtor: { nome: 'oathbound', versao: '0.50.0-alpha.54' } },
    { ts: '2026-11-20T15:02:00Z', agente: 'scout', agent_id: 'a1', sessao: 's1', ferramenta: 'Read', tool_use_id: 'k2', bloqueado: true, motivo: 'limite_de_leitura', produtor: { nome: 'oathbound', versao: '0.50.0-alpha.54' } },
  ];
  writeFileSync(join(claude, 'agent-audit.jsonl'), claudeRows.map(r => JSON.stringify(r)).join('\n') + '\n');

  const childId = '11111111-2222-3333-4444-555555555555';
  const transcriptRows = [
    // Mixed batch: run_command + single invoke_subagent
    {
      created_at: '2026-11-20T15:00:00Z', step_index: 10, source: 'MODEL', type: 'PLANNER_RESPONSE',
      tool_calls: [
        { name: 'run_command', args: {} },
        { name: 'invoke_subagent', args: { TypeName: 'smith' } },
      ],
    },
    { created_at: '2026-11-20T15:00:01Z', step_index: 11, source: 'MODEL', type: 'GENERIC', content: 'command ok' },
    {
      created_at: '2026-11-20T15:00:02Z', step_index: 12, source: 'MODEL', type: 'GENERIC',
      content: `Created the following subagent: { "conversationId": "${childId}" }`,
    },
    // Parallel multi-subagent batch: stays ambiguous
    {
      created_at: '2026-11-20T15:01:00Z', step_index: 20, source: 'MODEL', type: 'PLANNER_RESPONSE',
      tool_calls: [
        { name: 'invoke_subagent', args: { TypeName: 'assayer' } },
        { name: 'invoke_subagent', args: { TypeName: 'sentinel' } },
      ],
    },
  ];
  writeFileSync(join(agyTranscript, 'transcript.jsonl'), transcriptRows.map(r => JSON.stringify(r)).join('\n') + '\n');

  const out = join(root, 'out');
  execFileSync(process.execPath, [join(repo, 'tools/extract-audit.ts'),
    '--inicio', '2026-11-20', '--fim', '2026-11-20', '--saida', out,
    '--claude', claude, '--codex', join(root, 'codex'), '--gemini', join(root, 'gemini')]);

  const metrics = JSON.parse(readFileSync(join(out, 'metricas.json'), 'utf8'));
  const events = readFileSync(join(out, 'eventos.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

  assert.equal(metrics.por_cli.claude.correlacao_bloqueios.taxa, null);
  assert.equal(metrics.por_cli.claude.correlacao_por_coorte.com_produtor.denominador_taxa, 2);
  assert.equal(metrics.por_cli.claude.correlacao_por_coorte.com_produtor.taxa, 0.5);
  assert.equal(metrics.por_cli.claude.correlacao_por_coorte.legado.chamadas_sem_chave, 1);

  assert.deepEqual(metrics.por_cli.agy.correlacao_sessoes_filhas, { confirmada: 1, ambigua: 2 });
  const linked = events.find((e: any) => e.cli === 'agy' && e.agente === 'smith');
  assert.equal(linked.sessao_filha, childId);
  assert.equal(linked.evidencia_filha.metodo, 'criacao_no_turno');
});
