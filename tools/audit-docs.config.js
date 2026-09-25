'use strict';

// Configuração do próprio Agent Governance Kit. Projetos consumidores recebem
// um modelo separado e definem suas próprias pastas e contratos canônicos.
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
  rootDocs: ['AGENTS.md', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md'],
  docs: [
    { path: 'adapters', recursive: true, lineNumberRefs: 'allow' },
    { path: 'optional', recursive: true, lineNumberRefs: 'allow' },
    { path: 'skill', recursive: true, lineNumberRefs: 'allow' },
    { path: 'templates', recursive: true, lineNumberRefs: 'allow' },
    { path: 'tools', recursive: false, lineNumberRefs: 'allow' }
  ],
  lineRefAllowlist: [],
  targets: {}
};
