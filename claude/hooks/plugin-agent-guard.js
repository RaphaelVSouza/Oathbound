#!/usr/bin/env node
'use strict';

const readonly = require('./readonly-guard.js');
const readSize = require('./read-size-guard.js');
const destructive = require('./destructive-guard.js');
const audit = require('./agent-audit.js');

function avaliar(payload) {
  switch (payload.agent_type) {
    case 'oathbound:assayer':
    case 'oathbound:sentinel':
      if (payload.tool_name === 'Bash') {
        const motivo = readonly.avaliar(payload.tool_input?.command);
        if (motivo) return motivo;
      }
      return readSize.avaliar(payload);
    case 'oathbound:scout':
      return payload.tool_name === 'Read' ? readSize.avaliar(payload) : null;
    case 'oathbound:smith':
    case 'oathbound:scribe':
      return destructive.avaliar(payload);
    default:
      return null;
  }
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    let motivo;
    let payload;
    try {
      payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') throw new Error('payload inválido');
      motivo = avaliar(payload);
    } catch {
      motivo = 'entrada do hook inválida';
    }
    if (!motivo) return;
    audit.registrar(payload, { bloqueado: true, motivo });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: motivo,
      },
    }));
  });
}

module.exports = { avaliar };
