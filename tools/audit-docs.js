var major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 22) {
  console.error('audit-docs: requer Node >= 22 (atual: ' + process.version + ')');
  process.exit(1);
}
require('./audit-docs.core.js');
