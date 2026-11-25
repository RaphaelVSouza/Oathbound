'use strict';

const fs = require('node:fs');
const path = require('node:path');
const contract = require('./receipt-contract.json');

const runners = [
  { directory: 'claude/agents', extension: '.md', profile: 'claude/agents/oathkeeper.md', bullet: '- ', trigger: 'Section 3' },
  { directory: 'agy/config/agents', extension: '.md', profile: 'agy/config/agents/oathkeeper.md', bullet: '- ', trigger: 'Section 3' },
  { directory: 'codex/agents', extension: '.toml', profile: 'codex/oathkeeper.config.toml', bullet: '', trigger: 'security' },
];
const roles = ['assayer', 'breaker', 'scholar', 'scout', 'scribe', 'sentinel', 'smith'];

function replaceLine(source, prefix, replacement, file) {
  if (!replacement.startsWith(prefix) || /[\r\n]/.test(replacement)) {
    throw new Error(`${file}: expected a single contract line starting with "${prefix}"`);
  }
  let matches = 0;
  const output = source.split(/(\r?\n)/).map(line => {
    if (!line.startsWith(prefix)) return line;
    matches++;
    return replacement;
  }).join('');
  if (matches !== 1) throw new Error(`${file}: expected one "${prefix}" line, found ${matches}`);
  return output;
}

function renderReceiptContracts(root, rules = contract) {
  const changes = [];
  function render(file, lines, role) {
    const full = path.join(root, file);
    const source = fs.readFileSync(full, 'utf8');
    let output = lines.reduce(
      (current, [prefix, replacement]) => replaceLine(current, prefix, replacement, file),
      source,
    );
    if (role) {
      const pattern = new RegExp(
        `^AGENT: ${role}\\r?\\n(?:(?!AGENT: |GAPS: |\\x60\\x60\\x60|'''|""")[^\\r\\n]*\\r?\\n)*^GAPS: [^\\r\\n]+`,
        'gm',
      );
      const matches = [...output.matchAll(pattern)];
      if (matches.length !== 1) {
        throw new Error(`${file}: expected one receipt example for ${role}`);
      }
      const newline = matches[0][0].includes('\r\n') ? '\r\n' : '\n';
      const example = rules.examples[role].map(line => {
        if (line === '{status}') return rules.status;
        if (line === '{confidence}') return rules.confidence;
        return line;
      }).join(newline);
      output = output.replace(pattern, () => example);
    }
    if (source !== output) changes.push({ file, output });
  }

  for (const { directory, extension, profile, bullet, trigger } of runners) {
    for (const role of roles) {
      const rubricBullet = role === 'smith' ? '- ' : '';
      const lines = [
        [rubricBullet + 'CONFIDENCE (envelope): ', rubricBullet + rules.confidenceRubric],
      ];
      render(`${directory}/${role}${extension}`, lines, role);
    }
    render(profile, [
      [bullet + 'Before relying on any receipt, ', bullet + rules.receiptGate],
      [bullet + 'A finding tagged [handoff:sentinel] ', bullet + rules.handoff.replace('{trigger}', trigger)],
    ]);
  }
  return changes;
}

if (require.main === module) {
  try {
    const [mode, ...extra] = process.argv.slice(2);
    if (extra.length || !['--check', '--write'].includes(mode)) {
      throw new Error('Usage: node tools/render-receipt-contracts.cjs --check|--write');
    }
    const root = path.resolve(__dirname, '..');
    const changes = renderReceiptContracts(root);
    for (const { file, output } of changes) {
      if (mode === '--write') fs.writeFileSync(path.join(root, file), output);
      console.log(file);
    }
    if (mode === '--check' && changes.length) {
      throw new Error('Receipt contract drift. Run node tools/render-receipt-contracts.cjs --write.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { renderReceiptContracts };
