'use strict';
// Teste do guard de somente leitura. Rode: node test/hooks/readonly-guard.test.js
const assert = require('node:assert');
const path = require('path');
const { avaliar } = require(path.join(__dirname, '..', '..', 'claude', 'hooks', 'readonly-guard.js'));

const permitidos = [
  'git diff HEAD~1 HEAD -- AGENTS.md',
  'git show --stat HEAD',
  'git log -n 3 --format=%h',
  'git --no-pager log --oneline',
  'git -C /repo/projeto log -n 1 --oneline',
  'git -C /repo/projeto --no-pager diff HEAD~1',
  'git status --short',
  'git branch --show-current',
  'git branch -a',
  'rtk git diff HEAD~1 HEAD',
  'rtk proxy git log -n 1 --stat',
  'rtk rg -n "padrao > x" src/',
  'rtk read src/http.py',
  'rtk grep -n foo src',
  'rg -n foo | head -20',
  'ls -la && git status',
  'cd /repo/projeto && git log -n 1',
  'find . -name "*.py" -type f',
  'Get-ChildItem -Recurse | Select-String foo',
  'cat README.md | wc -l',
];

const negados = [
  'git commit -m x',
  'git push',
  'git checkout main',
  'git reset --hard',
  'git branch -D feature',
  'git branch novo',
  'git diff --output=saida.txt',
  'git -c core.pager=x log',
  'git -C /repo/projeto commit -m x',
  'git -C /repo/projeto push',
  'git -C',
  'rm -rf dir',
  'mv a b',
  'cp a b',
  'echo oi > arq.txt',
  'echo oi >> arq.txt',
  'cat a > b',
  'git log | tee out.txt',
  'ls; rm x',
  'ls && rm x',
  'ls || rm x',
  'ls & rm x',
  'echo $(rm x)',
  'echo `rm x`',
  'echo "$(rm x)"',
  'find . -delete',
  'find . -exec rm {} ;',
  'sort -o saida.txt entrada.txt',
  'sed -i s/a/b/ arq',
  'awk "{print}" arq',
  'node -e "1"',
  'python script.py',
  'npm install',
  'FOO=bar git log',
  'rtk',
  'rtk proxy',
  'rtk gain',
  'curl http://x',
  'Set-Content a.txt oi',
  'Remove-Item a.txt',
  'git log "unclosed',
  '',
  '   ',
];

let falhas = 0;
for (const c of permitidos) {
  const m = avaliar(c);
  if (m) { falhas++; console.error(`FALHA (deveria permitir): ${c}  -> ${m}`); }
}
for (const c of negados) {
  const m = avaliar(c);
  if (!m) { falhas++; console.error(`FALHA (deveria negar): ${JSON.stringify(c)}`); }
}
assert.strictEqual(falhas, 0, `${falhas} falha(s)`);
console.log(`ok: ${permitidos.length} permitidos, ${negados.length} negados`);
