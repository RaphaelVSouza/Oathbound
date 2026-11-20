#!/usr/bin/env node
'use strict';

const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 24) {
  console.error('audit-docs: requires Node >= 24 (current: ' + process.version + ')');
  process.exit(1);
}

const path = require('path');
const { auditDocs } = require('./audit-docs.core.ts');

const cli = process.argv.slice(2);
let projectArg = null;
let configArg = null;
let isStaged = false;
let isVerbose = false;
for (let i = 0; i < cli.length; i++) {
  const arg = cli[i];
  if (arg === '--project' || arg === '--config') {
    if (!cli[i + 1] || cli[i + 1].startsWith('--')) {
      console.error('audit-docs: missing value for ' + arg);
      process.exit(2);
    }
    if (arg === '--project') projectArg = cli[++i];
    else configArg = cli[++i];
  } else if (arg === '--staged') {
    isStaged = true;
  } else if (arg === '--verbose') {
    isVerbose = true;
  } else {
    console.error('audit-docs: unknown option: ' + arg);
    process.exit(2);
  }
}

const repoRoot = path.resolve(projectArg || path.join(__dirname, '..'));
const configPath = configArg ? path.resolve(configArg) : null;

try {
  const result = auditDocs({ repoRoot, configPath, staged: isStaged, verbose: isVerbose });
  if (result.stats.nothingToAudit) {
    console.log('audit-docs: nothing to audit');
    process.exit(0);
  }
  for (const w of result.warnings) console.warn(w);
  for (const e of result.errors) console.error(e);

  console.log(
    'source: ' + result.stats.sourceLabel +
    ' | .md files read: ' + result.stats.mdFiles +
    ' | source files read: ' + result.stats.sourceFiles +
    ' | ignored: ' + result.stats.ignoredCount +
    ' | violations: ' + result.errors.length +
    ' | warnings: ' + result.warnings.length
  );

  process.exit(result.errors.length > 0 ? 1 : 0);
} catch (err) {
  console.error('audit-docs: ' + err.message);
  process.exit(1);
}
