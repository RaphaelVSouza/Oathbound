'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPlugin } = require('../tools/build-plugin.cjs');

test('gera plugins isolados com agentes, hooks portáteis e sem sobrescrever destino', t => {
  const base = path.join(__dirname, '..', '.scratch');
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'plugin-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const runner of ['claude', 'agy']) {
    const out = buildPlugin(runner, path.join(tmp, runner));
    assert.equal(fs.readdirSync(path.join(out, 'agents')).length, 8);
    assert.equal(fs.readdirSync(path.join(out, 'skills')).length, 6);
    assert.equal(fs.existsSync(path.join(out, 'AGENTS.md')), false);
    assert.throws(() => buildPlugin(runner, out), /EEXIST/);
    if (runner === 'claude') {
      const agent = fs.readFileSync(path.join(out, 'agents', 'assayer.md'), 'utf8');
      assert.match(agent, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/readonly-guard\.js/);
      assert.doesNotMatch(agent, /__HOME__/);
      const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks', 'hooks.json'), 'utf8'));
      assert.match(JSON.stringify(hooks), /CLAUDE_PLUGIN_ROOT/);
    } else {
      const hooks = JSON.parse(fs.readFileSync(path.join(out, 'hooks.json'), 'utf8'));
      assert.equal(hooks['rtk-rewrite'].PreToolUse[0].hooks[0].command, 'node ./scripts/rtk-hook.js');
      assert.equal(Object.hasOwn(hooks['rtk-rewrite'], 'Stop'), false);
    }
  }
  assert.throws(() => buildPlugin('agy', path.resolve(tmp, '..', '..', '..', 'outside')), /dentro do repositório/);
});
