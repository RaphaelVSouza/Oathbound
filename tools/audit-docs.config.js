'use strict';

// Configuration for Oathbound itself. Consumer projects receive
// a separate template and define their own directories and canonical contracts.
module.exports = {
  limits: { maxBytes: 1048576 },
  blocklist: {
    names: ['node_modules', '.git', 'dist', 'coverage'],
    pathSegments: ['/.scratch/'],
    filePatterns: []
  },
  checks: {
    anchors: 'warn',
    portability: 'error',
    outsideRepo: 'error'
  },
  rootDocs: ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CHANGELOG.md'],
  docs: [
    { path: 'docs', recursive: true, lineNumberRefs: 'allow' },
    { path: 'claude', recursive: true, lineNumberRefs: 'allow' },
    { path: 'agy', recursive: true, lineNumberRefs: 'allow' },
    { path: 'skills', recursive: true, lineNumberRefs: 'allow' },
    { path: 'tools', recursive: false, lineNumberRefs: 'forbid' }
  ],
  lineRefAllowlist: ['CHANGELOG.md'],
  forbiddenTerms: {
    paths: ['README.md', 'CONTRIBUTING.md', 'AGENTS.md'],
    terms: ['caipora', 'opencode', 'oathbound.dev']
  },
  targets: {}
};
