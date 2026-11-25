'use strict';

// Guards line endings: the index and every checkout must be LF, so tests and
// tools never depend on a platform's `core.autocrlf`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('tracked text files are LF in the index and in the working tree', () => {
  const out = execFileSync('git', ['ls-files', '--eol'], { cwd: root, encoding: 'utf8' });
  const bad = out.split(/\r?\n/).filter(Boolean).filter(line => {
    const [index, work] = line.split('\t')[0].trim().split(/\s+/);
    return /^(i\/(crlf|mixed))$/.test(index) || /^(w\/(crlf|mixed))$/.test(work);
  });
  assert.deepEqual(bad, [], 'Files with CR line endings (see .gitattributes):\n' + bad.join('\n'));
});
