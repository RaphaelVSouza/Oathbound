'use strict';

// Adapte esta allowlist ao projeto. O auditor não percorre pastas não listadas.
module.exports = {
  limits: { maxBytes: 1048576 },
  blocklist: {
    names: ['node_modules', '.git', 'dist', 'coverage'],
    pathSegments: ['/.scratch/'],
    filePatterns: []
  },
  checks: {
    anchors: 'warn',
    portability: 'warn',
    outsideRepo: 'warn'
  },
  rootDocs: ['AGENTS.md', 'README.md'],
  docs: [
    { path: 'docs', recursive: true, lineNumberRefs: 'allow' }
  ],
  lineRefAllowlist: [],
  // Opcional: declare arquivos e símbolos canônicos para exigir TSDoc,
  // comentários WHY: e ausência de BOM. Consulte tools/README.md do kit.
  targets: {}
};
