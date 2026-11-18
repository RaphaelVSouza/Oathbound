'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildPlugin } = require('./build-plugin.cjs');

const modelo = 'claude-haiku-5-5';
const orquestrador = 'oathbound:orquestrador';
const assayer = 'oathbound:assayer';
const fixture = 'frete.test.js';
const regra = '// Frete grátis acima de 100.\n';
const ambiguidade = '// Frete grátis acima de 100. Exatamente 100: regra pendente.\n';
const casos = {
  'falso-positivo': {
    regra,
    pedido: 'Revise apenas frete.test.js e informe a asserção inadequada, seu valor esperado e arquivo:linha.',
  },
  ambiguidade: {
    regra: ambiguidade,
    pedido: 'Revise apenas frete.test.js. Identifique a pergunta de negócio pendente e siga com a revisão do caso claro.',
  },
  delegacao: {
    regra,
    delega: true,
    pedido: 'Peço uma segunda leitura de frete.test.js pelo oathbound:assayer em primeiro plano. Aguarde o resultado e confira a linha da asserção.',
  },
  guard: {
    regra,
    delega: true,
    pedido: 'Peço um teste de integração do guard pelo oathbound:assayer em primeiro plano. Instrua-o a tentar uma chamada Read de frete.test.js com offset 1 e limit 151, aguardar o resultado e reportar a decisão do hook. O arquivo é sintético e tem quatro linhas.',
  },
};

function temporario(pai, executar) {
  const base = fs.realpathSync(pai);
  const dir = path.join(base, '.oathbound-smoke-' + randomUUID());
  fs.mkdirSync(dir);
  try {
    return executar(dir);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(dir)), base, 'Diretório temporário fora do destino');
    fs.rmSync(dir, { recursive: true });
  }
}

function eventos(stdout) {
  return stdout.trim().split(/\r?\n/).filter(Boolean).map((linha) => JSON.parse(linha));
}

function conferir(id, caso, fluxo, resultado, auditoria) {
  const inicio = fluxo.find((evento) => evento.type === 'system' && evento.subtype === 'init');
  assert.ok(inicio?.plugins?.some((plugin) => plugin.name === 'oathbound'), 'Plugin Oathbound ausente');
  assert.ok(inicio.agents?.includes(orquestrador), 'Orquestrador ausente');
  const mensagens = fluxo.filter((evento) => evento.type === 'assistant');
  assert.ok(mensagens.length, 'Nenhum evento do modelo');
  const modelos = Object.keys(resultado.modelUsage || {});
  assert.deepEqual(modelos, [modelo], 'Uso de modelo fora do Haiku fixado');
  assert.ok(mensagens.every((evento) => evento.message?.model === modelo), 'Modelo inesperado em evento');

  const chamadas = mensagens.flatMap((evento) => (evento.message?.content || [])
    .filter((bloco) => bloco.type === 'tool_use')
    .map((bloco) => ({ ...bloco, pai: evento.parent_tool_use_id })));
  const agentes = chamadas.filter((bloco) => bloco.name === 'Agent');
  assert.deepEqual(agentes.map((bloco) => bloco.input.subagent_type), caso.delega ? [assayer] : []);
  assert.equal(resultado.subagent_stats?.completed, caso.delega ? 1 : 0, 'Contagem de subagentes concluídos');

  const leituras = chamadas.filter((bloco) => bloco.name === 'Read'
    && path.basename(bloco.input.file_path || '') === fixture);

  if (id === 'guard') {
    const leitura = leituras.find((bloco) => bloco.pai === agentes[0].id && bloco.input.limit === 151);
    assert.ok(leitura, 'Assayer não tentou a leitura acima do limite');
    assert.ok(fs.existsSync(auditoria), 'Hook não registrou bloqueio');
    assert.ok(eventos(fs.readFileSync(auditoria, 'utf8')).some((evento) =>
      evento.agente === assayer && evento.ferramenta === 'Read' && evento.bloqueado === true
      && evento.motivo === 'politica_do_agente' && evento.tool_use_id === leitura.id),
    'Trilha do hook não confirma o bloqueio da chamada');
    return;
  }

  assert.ok(leituras.some((bloco) => caso.delega ? bloco.pai === agentes[0].id : !bloco.pai),
    'Leitura da fixture ausente no agente esperado');
  assert.match(resultado.result || '', /frete\.test\.js:4\b/i, 'Referência à asserção ausente');
  assert.match(resultado.result, />=\s*0|não.negativ/i, 'Evidência da asserção fraca ausente');
  assert.match(resultado.result.replace(/>=\s*0/g, ''), /\b0\b|\bzero\b/i, 'Valor esperado ausente');
  if (id === 'ambiguidade') {
    assert.match(resultado.result, /100[^?\n]*\?|\?[^\n]*100/i, 'Pergunta sobre o limite ausente');
  }
}

function executar(id, caso, projeto, plugin) {
  fs.writeFileSync(path.join(projeto, fixture),
    "const assert = require('node:assert/strict');\nconst frete = () => 12;\n"
    + caso.regra + 'assert.ok(frete(120) >= 0);\n');
  const auditDir = path.join(projeto, 'auditoria');
  const env = {
    ...process.env,
    CLAUDE_CODE_SUBAGENT_MODEL: modelo,
    ANTHROPIC_DEFAULT_SONNET_MODEL: modelo,
    ANTHROPIC_DEFAULT_OPUS_MODEL: modelo,
    AGENT_AUDIT_DIR: auditDir,
  };
  const processo = spawnSync(process.env.CLAUDE_BIN || 'claude', [
    '-p', caso.pedido, '--model', modelo, '--agent', orquestrador,
    '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    '--permission-mode', 'dontAsk', '--tools', caso.delega ? 'Read,Glob,Grep,Agent' : 'Read,Glob,Grep',
    '--output-format', 'stream-json', '--verbose', '--max-turns', '8',
    '--max-budget-usd', '0.05', '--plugin-dir', plugin,
  ], { cwd: projeto, env, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  if (processo.error) throw processo.error;
  const fluxo = eventos(processo.stdout);
  const resultado = fluxo.findLast((evento) => evento.type === 'result');
  if (Number.isFinite(resultado?.total_cost_usd)) {
    console.log(`Custo reportado: US$ ${resultado.total_cost_usd.toFixed(6)}`);
  }
  assert.equal(processo.status, 0, processo.stderr.trim() || resultado?.subtype || 'Claude falhou');
  assert.ok(resultado?.subtype === 'success' && resultado.is_error === false, 'Execução sem resultado de sucesso');
  conferir(id, caso, fluxo, resultado, path.join(auditDir, 'agent-audit.jsonl'));
}

const args = process.argv.slice(2);
const id = args[1];
if (args.length === 1 && args[0] === '--listar') {
  console.log(Object.keys(casos).join('\n'));
} else if (args.length !== 3 || args[0] !== '--caso' || !Object.hasOwn(casos, id) || args[2] !== '--pago') {
  console.error('Uso: node tools/smoke-orquestrador.cjs --listar | --caso <id> --pago');
  process.exitCode = 2;
} else {
  try {
    temporario(path.resolve(__dirname, '..'), (dir) => {
      const plugin = buildPlugin('claude', path.join(dir, 'plugin'));
      temporario(os.tmpdir(), (projeto) => executar(id, casos[id], projeto, plugin));
    });
    console.log(`PASS ${id} (${modelo})`);
  } catch (erro) {
    console.error(`FAIL ${id}: ${erro.message}`);
    process.exitCode = 1;
  }
}
