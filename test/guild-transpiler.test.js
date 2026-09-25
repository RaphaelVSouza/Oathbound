const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseFrontmatter,
  determineClaudeTools,
  transpileForClaude,
  transpileForAgy,
  transpileForOpenCode,
  transpileAgent,
  getNativeAgentDir,
  transpileAll
} = require('../tools/guild-transpiler.js');

test('agent-transpiler: parseFrontmatter extrai campos e corpo corretamente', () => {
  const content = `---
description: Test agent description
mode: all
temperature: 0
steps: 10
permission:
  read:
    "*": allow
    "*.env": deny
  edit: deny
  bash: deny
---

Linha de corpo 1.
Linha de corpo 2.`;

  const parsed = parseFrontmatter(content);
  assert.equal(parsed.frontmatter.description, 'Test agent description');
  assert.equal(parsed.frontmatter.mode, 'all');
  assert.equal(parsed.frontmatter.temperature, 0);
  assert.equal(parsed.frontmatter.steps, 10);
  assert.equal(parsed.frontmatter.permission.read['*'], 'allow');
  assert.equal(parsed.frontmatter.permission.read['*.env'], 'deny');
  assert.equal(parsed.frontmatter.permission.edit, 'deny');
  assert.equal(parsed.frontmatter.permission.bash, 'deny');
  assert.ok(parsed.body.includes('Linha de corpo 1.'));
});

test('agent-transpiler: determineClaudeTools aloca ferramentas conforme permissões', () => {
  // Read-only
  const readOnlyTools = determineClaudeTools({
    read: { '*': 'allow' },
    edit: 'deny',
    bash: 'deny'
  });
  assert.deepEqual(readOnlyTools, ['Read', 'Grep', 'Glob']);

  // Com bash
  const bashTools = determineClaudeTools({
    read: { '*': 'allow' },
    edit: 'deny',
    bash: { 'git status': 'allow' }
  });
  assert.deepEqual(bashTools, ['Read', 'Grep', 'Glob', 'Bash']);

  // Com edit e bash
  const editBashTools = determineClaudeTools({
    read: { '*': 'allow' },
    edit: { '*': 'allow' },
    bash: 'allow'
  });
  assert.deepEqual(editBashTools, ['Read', 'Grep', 'Glob', 'Edit', 'Bash']);

  // Com webfetch
  const webTools = determineClaudeTools({
    read: { '*': 'allow' },
    edit: 'deny',
    bash: 'deny',
    webfetch: 'allow'
  });
  assert.deepEqual(webTools, ['Read', 'Grep', 'Glob', 'WebFetch']);
});

test('agent-transpiler: transpileAgent gera formato correto para Claude Code', () => {
  const sample = `---
description: Explorador read-only
mode: all
permission:
  read:
    "*": allow
  edit: deny
  bash: deny
---

Instruções do agente explorador.`;

  const output = transpileAgent('ds-explorer', sample, 'claude');
  assert.ok(output.startsWith('---\nname: ds-explorer\ndescription: Explorador read-only\ntools:\n  - Read\n  - Grep\n  - Glob\n---'));
  assert.ok(output.includes('Instruções do agente explorador.'));
  assert.ok(!output.includes('permission:'));
  assert.ok(!output.includes('mode: all'));
});

test('agent-transpiler: transpileAgent gera formato correto para AGY CLI', () => {
  const sample = `---
description: Revisor de código
mode: all
permission:
  edit: deny
---

Instruções de revisão.`;

  const output = transpileAgent('ds-reviewer', sample, 'agy');
  assert.ok(output.startsWith('---\nname: ds-reviewer\ndescription: Revisor de código\n---'));
  assert.ok(output.includes('Instruções de revisão.'));
  assert.ok(!output.includes('permission:'));
});

test('agent-transpiler: transpileAgent preserva formato nativo para OpenCode', () => {
  const sample = `---
description: Original OpenCode
permission:
  edit: deny
---

Body.`;

  const output = transpileAgent('ds-custom', sample, 'opencode');
  assert.equal(output, sample);
});

test('agent-transpiler: transpileAgent rejeita runners sem agentes baseados em arquivo', () => {
  assert.throws(
    () => transpileAgent('ds-test', 'content', 'codex'),
    /Runner 'codex' não utiliza arquivos de agentes nativos/
  );
  assert.throws(
    () => transpileAgent('ds-test', 'content', 'generic'),
    /Runner 'generic' não utiliza arquivos de agentes nativos/
  );
  assert.throws(
    () => transpileAgent('ds-test', 'content', 'desconhecido'),
    /Runner não suportado para transpilação/
  );
});

test('agent-transpiler: getNativeAgentDir resolve caminhos esperados', () => {
  const projectRoot = path.resolve('D:/meu-projeto');

  // OpenCode
  assert.equal(
    getNativeAgentDir(projectRoot, 'opencode', false),
    path.join(projectRoot, '.opencode', 'agents')
  );

  // Claude Code
  assert.equal(
    getNativeAgentDir(projectRoot, 'claude', false),
    path.join(projectRoot, '.claude', 'agents')
  );

  // AGY CLI
  assert.equal(
    getNativeAgentDir(projectRoot, 'agy', false),
    path.join(projectRoot, '.agents', 'agents')
  );

  // Codex & Generic
  assert.equal(getNativeAgentDir(projectRoot, 'codex', false), null);
  assert.equal(getNativeAgentDir(projectRoot, 'generic', false), null);
});

test('agent-transpiler: transpileAll gera arquivos em diretório temporário', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'govkit-transpiler-test-'));

  try {
    const res = transpileAll({
      targetRoot: tmpDir,
      runner: 'all',
      isGlobal: false,
      force: true
    });

    assert.equal(res.results.length, 3); // opencode, claude, agy

    const claudeDir = path.join(tmpDir, '.claude', 'agents');
    assert.ok(fs.existsSync(claudeDir));
    const claudeFiles = fs.readdirSync(claudeDir);
    assert.ok(claudeFiles.includes('ds-explorer.md'));
    assert.ok(claudeFiles.includes('ds-committer.md'));

    const agyDir = path.join(tmpDir, '.agents', 'agents');
    assert.ok(fs.existsSync(agyDir));
    const agyFiles = fs.readdirSync(agyDir);
    assert.ok(agyFiles.includes('ds-explorer.md'));

    const opencodeDir = path.join(tmpDir, '.opencode', 'agents');
    assert.ok(fs.existsSync(opencodeDir));
    const opencodeFiles = fs.readdirSync(opencodeDir);
    assert.ok(opencodeFiles.includes('ds-explorer.md'));

    // Teste de codex (ignorado com flag skipped)
    const codexRes = transpileAll({
      targetRoot: tmpDir,
      runner: 'codex',
      isGlobal: false
    });
    assert.equal(codexRes.results[0].skipped, true);
    assert.equal(codexRes.results[0].count, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
