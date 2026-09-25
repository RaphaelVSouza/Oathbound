const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', 'skill');

/** Lista todo arquivo .md sob skill/, recursivamente. */
function listMarkdown(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

/** Extrai destinos de links Markdown inline: [texto](destino). */
function extractLinkDestinations(content) {
  const dests = [];
  const re = /\]\(([^)\s]+)\)/g;
  let match;
  while ((match = re.exec(content)) !== null) dests.push(match[1]);
  return dests;
}

test('skill: nenhum link Markdown aponta para fora de skill/', () => {
  const skillDir = path.resolve(SKILL_DIR);
  const offenders = [];

  for (const file of listMarkdown(skillDir)) {
    const relFromSkill = path.relative(skillDir, file).split(path.sep).join('/');
    const content = fs.readFileSync(file, 'utf8');

    for (const dest of extractLinkDestinations(content)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(dest) || dest.startsWith('//')) continue; // externo
      if (dest.startsWith('#')) continue; // âncora interna

      const target = path.resolve(path.dirname(file), dest.split('#')[0].split('?')[0]);
      const rel = path.relative(skillDir, target);
      if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
        offenders.push(`${relFromSkill} -> ${dest}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `links fora de skill/:\n${offenders.join('\n')}`);
});
