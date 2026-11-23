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
