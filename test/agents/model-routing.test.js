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

test('all subagents have emoji-free standardized contracts, batching rules, and expected isolation', () => {
  const { executar } = require('./sincronia.js');
  assert.deepEqual(executar(), [], 'all 3 runners must stay synchronized with regras-comuns.json');
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const envelopeContracts = [
    /^AGENT:\s+/m,
    /^SCOPE:\s+/m,
    /^STATUS:\s+DONE \| PARTIAL \| BLOCKED/m,
    /^CONFIDENCE:\s+HIGH \| MEDIUM \| LOW/m,
    /^GAPS:\s+/m,
  ];
  const requiredContracts = {
    scout: [/ANSWER:/, /EVIDENCE:/, /CONFIRMED\|REFUTED\|INCONCLUSIVE/, /TOTALS:/],
    scholar: [/ANSWER:/, /SOURCES:/],
    smith: [/FILES:/, /ACCEPTANCE:/],
    scribe: [/MODE:/, /FILES:/],
    assayer: [/BUG \[CRITICAL\|HIGH\|MEDIUM\|LOW\]/, /RISK \[CRITICAL\|HIGH\|MEDIUM\|LOW\]/, /NIT/, /QUESTION/, /totals:.*BUG.*RISK.*NIT.*QUESTION/, /COVERAGE:/, /No issues\./],
    sentinel: [/CRITICAL/, /HIGH/, /MEDIUM/, /LOW/, /CWE-862/, /CWE-863/, /\bCONFIRMED\b/, /\bLIKELY\b/, /\bPOSSIBLE\b/, /CONDITION:/, /IMPACT:/, /FIX:/, /EVIDENCE:/, /SCORE:/, /totals:.*CRITICAL.*HIGH.*MEDIUM.*LOW/, /COVERAGE:/, /No findings in scope\./],
    breaker: [/RESULT: PASS \| FAIL \| none/, /ENVIRONMENT:/, /FLOW:/, /CONSOLE:/, /NETWORK:/, /EVIDENCE:/, /\.scratch\/breaker\//],
  };
  for (const role of roles) {
    const files = [
      read(`claude/agents/${role}.md`),
      read(`agy/config/agents/${role}.md`),
      read(`codex/agents/${role}.toml`),
    ];
    for (const content of files) {
      assert.doesNotMatch(content, emojiRe, `${role} must not contain emojis`);
      assert.doesNotMatch(content, /^(?:NOTE|PENDING):/m, `${role} must not use legacy NOTE/PENDING fields`);
      assert.doesNotMatch(content, /CWE-285|No security vulnerabilities found in scope/, `${role} must not use legacy sentinel CWE-285 or absence claim`);
      assert.match(content, /\bparallel\b/i, `${role} should batch independent operations`);
      for (const re of envelopeContracts) {
        assert.match(content, re, `${role} missing ADR-0010 envelope marker ${re}`);
      }
      for (const re of requiredContracts[role]) {
        assert.match(content, re, `${role} missing standardized contract marker ${re}`);
      }
    }
  }
  for (const roRole of ['scout', 'assayer', 'sentinel']) {
    assert.match(read(`codex/agents/${roRole}.toml`), /^sandbox_mode = "read-only"$/m, roRole);
  }
  assert.doesNotMatch(read('codex/agents/scholar.toml'), /^sandbox_mode = "read-only"$/m);
});

test('all runners preserve E1-E6 subagent alignment and orchestrator receipt gates', () => {
  const confLine = 'CONFIDENCE (envelope): HIGH = every claim is backed by evidence read or executed in this call; MEDIUM = some claims rest on inference or unread context; LOW = mostly inference or incomplete evidence. Never HIGH when STATUS is PARTIAL.';
  const gapsLine = 'GAPS is never "none" when STATUS is PARTIAL or BLOCKED.';
  const plainLine = 'Respond in plain text: no code fence, no heading, no preamble, and no emojis. The receipt block shown here is only an example.';
  const count = (text, needle) => text.split(needle).length - 1;

  for (const file of ['claude/agents/assayer.md', 'agy/config/agents/assayer.md']) {
    const content = read(file);
    assert.equal(content.split('\n')[0], '---', `${file} must start with --- at col 0`);
    assert.doesNotMatch(content, /^ +---$/m, `${file} must not indent frontmatter delimiters`);
  }

  for (const role of roles) {
    for (const file of [`claude/agents/${role}.md`, `agy/config/agents/${role}.md`, `codex/agents/${role}.toml`]) {
      const content = read(file);
      assert.equal(count(content, confLine), 1, `${file} CONFIDENCE rubric count`);
      if (['smith', 'scribe', 'breaker'].includes(role)) {
        assert.equal(count(content, gapsLine), 1, `${file} GAPS never-none count`);
        assert.doesNotMatch(content, /Return only the receipt block/, `${file} legacy receipt phrasing`);
      } else {
        assert.equal(count(content, gapsLine), 0, `${file} should not duplicate GAPS never-none line`);
      }
      if (['scout', 'scholar', 'smith', 'scribe', 'breaker'].includes(role)) {
        assert.equal(count(content, plainLine), 1, `${file} plain-text line count`);
      }
    }
  }

  for (const file of ['claude/agents/sentinel.md', 'agy/config/agents/sentinel.md', 'codex/agents/sentinel.toml']) {
    const content = read(file);
    assert.ok(content.includes('LOW 0.1-3.9, MEDIUM 4.0-6.9, HIGH 7.0-8.9, CRITICAL 9.0-10.0'), `${file} CVSS bands`);
    assert.ok(content.includes('Envelope CONFIDENCE is the agent\'s certainty about the whole output; the finding tag [CONFIRMED|LIKELY|POSSIBLE] is the proof level of one finding. Do not mix them.'), `${file} confidence vs tag`);
    assert.ok(content.includes('CWE IDs 22, 798, 862 and 863 are "allowed with review" at MITRE'), `${file} MITRE mapping note`);
  }

  for (const file of ['claude/agents/breaker.md', 'agy/config/agents/breaker.md', 'codex/agents/breaker.toml']) {
    const content = read(file);
    assert.ok(content.includes('.gitignore'), `${file} must mention .gitignore`);
    assert.ok(content.includes('EVIDENCE: <persistent path under .scratch/breaker/ for a screen free of sensitive data, or "none">'), `${file} EVIDENCE receipt line`);
    assert.ok(content.includes('SCOPE: <journey and repo commit/build under test>'), `${file} SCOPE receipt line`);
    assert.doesNotMatch(content, /redacted screenshots/i, `${file} must not claim redacted screenshots`);
  }

  for (const file of ['claude/agents/assayer.md', 'agy/config/agents/assayer.md', 'codex/agents/assayer.toml']) {
    assert.ok(read(file).includes('[handoff:sentinel]'), `${file} must document [handoff:sentinel]`);
  }

  for (const [runner, profile] of Object.entries(profiles)) {
    assert.ok(profile.includes('Before relying on any receipt, read STATUS, CONFIDENCE, COVERAGE (when present) and GAPS.'), `${runner} receipt gate`);
    assert.ok(profile.includes('A finding tagged [handoff:sentinel] in an assayer receipt triggers sentinel'), `${runner} handoff trigger`);
  }
});
