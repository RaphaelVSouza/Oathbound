'use strict';

// Offline instruction contracts. These do not execute agents or prove runtime routing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const profiles = {
  codex: read('codex/oathkeeper.config.toml'),
  claude: read('claude/agents/oathkeeper.md'),
  agy: read('agy/config/agents/oathkeeper.md'),
};
const roles = ['scout', 'scholar', 'scribe', 'smith', 'assayer', 'sentinel', 'breaker'];

function section(profile, heading) {
  const start = profile.indexOf(heading + '\n');
  assert.notEqual(start, -1, `Missing ${heading}`);
  return profile.slice(start + heading.length + 1).split(/\n#{2,3} /)[0].trim();
}

test('all orchestrators preserve the same adaptive safety and reporting contract', () => {
  const shared = section(profiles.codex, '### Adaptive selection');
  for (const [runner, profile] of Object.entries(profiles)) {
    assert.equal(section(profile, '### Adaptive selection'), shared, runner);
    assert.doesNotMatch(profile, /Do not change an agent's model to retry/);
    assert.doesNotMatch(profile, /\| Need \| Agent \| Model \|/);
    for (const role of roles) assert.match(profile, new RegExp(`\\b${role}\\b`));
  }
  // Safety clauses are release contracts, independent of provider wording.
  assert.match(shared, /User\/project pins, organization restrictions, environment-forced settings/);
  assert.match(shared, /Never skip required review or security steps/);
  assert.match(shared, /Allow at most one escalation per subtask across all children/);
  assert.match(shared, /Smith still stops after two identical errors/);
  assert.match(shared, /missing access,[\s\S]*not escalation/);
  assert.match(shared, /runtime metadata, not subagent self-identification/);
  for (const field of ['role', 'tier', 'model', 'effort', 'reason', 'attempt']) {
    assert.match(shared, new RegExp(`${field}=<`));
  }
  assert.match(shared, /ROUTING RESULT: model=<observed\|unverified>; effort=<observed\|unverified>/);
});

test('all orchestrators share the same numbered final report', () => {
  const block = (profile, heading) => {
    const body = section(profile, heading);
    const match = body.match(/```\n([\s\S]*?)\n```/);
    assert.ok(match, `Missing report block under ${heading}`);
    return match[1];
  };
  const shared = block(profiles.codex, '### Final report');
  for (const [runner, profile] of Object.entries(profiles)) {
    const heading = runner === 'codex' ? '### Final report' : '## 7. Final report';
    assert.equal(block(profile, heading), shared, runner);
  }
  for (const line of ['RESULT:', 'AGENTS:', 'VALIDATIONS:', 'ENVIRONMENT:', 'PENDING:']) {
    assert.match(shared, new RegExp(`^${line}`, 'm'));
  }
  assert.match(shared, /^ {2}A01 /m);
  assert.match(shared, /^ {2}V01 PASS\|FAIL\|SKIP /m);
  assert.match(shared, /^ {2}P01 decision\|risk\|blocked /m);
  for (const [runner, profile] of Object.entries(profiles)) {
    const body = section(profile, runner === 'codex' ? '### Final report' : '## 7. Final report');
    assert.match(body, /An empty field is `none`/, runner);
    assert.match(body, /mark it `SKIP`/, runner);
    assert.match(body, /Never list an action the user already requested/, runner);
    assert.match(body, /Order PENDING by dependency/, runner);
    assert.match(body, /after P01/, runner);
  }
  // A named action or its goal is the confirmation; the gate must not force a second ask.
  for (const [runner, profile] of Object.entries(profiles)) {
    assert.match(profile, /is the confirmation: do\s+not ask again/, runner);
    assert.match(profile, /only for actions the user did not request/, runner);
  }
});

test('one role can use different complexity tiers without duplicating role definitions', () => {
  for (const [runner, profile] of Object.entries(profiles)) {
    const provider = section(profile, '### Provider selection');
    const rows = provider.split('\n').filter(line => /^\| /.test(line)).slice(1);
    const preference = term => rows.find(row => row.toLowerCase().includes(term))?.split('|').map(s => s.trim());
    const routine = preference('routine');
    const standard = preference('standard');
    const complex = preference('complex') || preference('deep cross-system');
    assert.ok(routine && standard && complex, runner);
    assert.notEqual(routine[2], standard[2], runner);
    assert.notDeepEqual(standard.slice(2, 4), complex.slice(2, 4), runner);
    // Scribe stays one role; release notes and architecture are task classifications.
    const agentDir = runner === 'codex' ? 'codex/agents' : runner === 'claude' ? 'claude/agents' : 'agy/config/agents';
    const files = fs.readdirSync(path.join(root, agentDir));
    assert.equal(files.filter(file => file.startsWith('scribe.')).length, 1);
  }
});

test('runner adapters retain capability checks instead of inventing invocation support', () => {
  assert.match(profiles.codex, /fork_turns="none"/);
  for (const role of roles) {
    assert.doesNotMatch(read(`codex/agents/${role}.toml`), /^(model|model_reasoning_effort)\s*=/m);
  }
  assert.match(profiles.claude, /model alias, not a full version ID or inherit/);
  assert.match(profiles.claude, /per-invocation effort requires Claude Code v2\.1\.292/);
  assert.match(profiles.agy, /session model slugs do not prove child invocation support/);
  assert.match(profiles.agy, /tier-only invocation support, request flash for routine and pro for/);
  assert.match(profiles.agy, /Without a child effort field, retain inherited effort/);
  assert.match(profiles.agy, /Orchestrator has fixed effort/);
  for (const role of roles) {
    const frontmatter = read(`agy/config/agents/${role}.md`).split('---')[1];
    assert.doesNotMatch(frontmatter, /^(effort|reasoning_effort):/m);
    assert.doesNotMatch(frontmatter, /^model:.*gemini-4-/m);
  }
});

test('all orchestrators stay autonomous on clear bounded work and avoid unnecessary rounds', () => {
  for (const [runner, profile] of Object.entries(profiles)) {
    assert.match(profile, /~3 closely related files/, runner);
    assert.match(profile, /not mandatory separate subagent spawns/, runner);
    assert.match(profile, /Proceed without waiting for plan OK/i, runner);
    assert.match(profile, /never ask permission for required local checks/i, runner);
    assert.match(profile, /record the open choice in `PENDING`/i, runner);
  }
});
