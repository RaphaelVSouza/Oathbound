'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const check = spawnSync('rtk', ['rg', '--version'], { encoding: 'utf8' });
if (check.error || (check.status !== 0 && (check.stderr.includes('not found') || check.stderr.includes('program not found')))) {
  console.log('skip: rtk or rg binary unavailable on PATH');
  process.exit(0);
}

const cwd = path.join(__dirname, `.tmp-${randomUUID()}`);
const filename = 'sample.txt';
const needle = 'decisive match';
const warning = "Failed to resolve 'rg' via PATH";
const withoutPathext = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'PATHEXT'),
);
// Avoids recovery files and timestamp references in output.
withoutPathext.RTK_RECALL = '0';
const env = process.platform === 'win32'
  ? { ...withoutPathext, PATHEXT: '.COM;.EXE;.BAT;.CMD' }
  : withoutPathext;

function run(args, options = {}) {
  const result = spawnSync('rtk', args, { cwd, env, encoding: 'utf8', timeout: 10_000, ...options });
  if (result.error) throw result.error;
  return result;
}

fs.mkdirSync(cwd);
try {
  const lines = Array.from({ length: 200 }, (_, i) => `common match ${i + 1}`);
  lines.push(needle);
  fs.writeFileSync(path.join(cwd, filename), lines.join('\n') + '\n');

  const broadArgs = ['rg', '-n', 'match', filename];
  const raw = run(['proxy', ...broadArgs]);
  const compact = run(broadArgs);
  assert.equal(raw.status, 0, raw.stderr);
  assert.equal(compact.status, 0, compact.stderr);
  assert.ok(raw.stdout.includes(`201:${needle}`), 'Full search must include the last match');
  assert.ok(compact.stdout.includes('common match 1'), 'Triage must preserve evidence');
  assert.ok(compact.stdout.length < raw.stdout.length, 'Triage must shorten broad output');

  if (process.platform === 'win32') {
    assert.ok(!compact.stderr.includes(warning), compact.stderr);
    const control = run(broadArgs, { env: withoutPathext });
    assert.equal(control.status, 0, control.stderr);
    assert.equal(control.stdout, compact.stdout, 'Resolving the binary must preserve filtered output');
    console.log(`Control without PATHEXT: ${control.stderr.includes(warning) ? 'fallback reported' : 'no warning'}`);
  }

  for (const mode of [[], ['proxy']]) {
    const focused = run([...mode, 'rg', '-n', needle, filename]);
    assert.equal(focused.status, 0, focused.stderr);
    assert.match(focused.stdout, /201:\s*decisive match/);
    const missing = run([...mode, 'rg', '-n', 'missing marker', filename]);
    assert.equal(missing.status, 1, missing.stderr);
  }

  const cases = [['Bash', 'cd . && ']];
  if (process.platform === 'win32') cases.push(['PowerShell', 'Set-Location .; ']);
  for (const [tool, prefix] of cases) {
    const command = `${prefix}rg -n match ${filename}`;
    const hook = run(['hook', 'claude'], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: tool,
        tool_input: { command },
        cwd,
      }),
    });
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.updatedInput.command,
      `${prefix}rtk rg -n match ${filename}`);
  }

  console.log(`RTK: broad search ${raw.stdout.length} → ${compact.stdout.length} characters. Focused search and hook OK.`);
} finally {
  const fixture = path.join(cwd, filename);
  if (fs.existsSync(fixture)) fs.unlinkSync(fixture);
  fs.rmdirSync(cwd);
}
