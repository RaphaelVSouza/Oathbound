'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNNER_OVERRIDE = /^SKILL\.(claude|agy|codex)\.md$/;

function* selectSkillFiles(skillDir, runner, files) {
  const overrideName = `SKILL.${runner}.md`;
  const hasOverride = fs.existsSync(path.join(skillDir, overrideName));
  for (const full of files) {
    const rel = path.relative(skillDir, full).split(path.sep).join('/');
    if (rel === overrideName) {
      yield { rel: 'SKILL.md', full };
      continue;
    }
    if (RUNNER_OVERRIDE.test(rel)) continue;
    if (runner !== 'codex' && rel === 'agents/openai.yaml') continue;
    if (hasOverride && rel === 'SKILL.md') continue;
    yield { rel, full };
  }
}

module.exports = { selectSkillFiles };
