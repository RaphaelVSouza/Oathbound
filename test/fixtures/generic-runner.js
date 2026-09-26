#!/usr/bin/env node
// Fixture do runner 'generic' para testes de fila (queue.test.js). Grava a
// mensagem recebida (último argv) num arquivo indicado por
// OATHBOUND_FIXTURE_LOG e imprime uma resposta fixa (ou executa uma ação
// prévia) conforme variáveis de ambiente:
//
// - OATHBOUND_FIXTURE_LOG: caminho do arquivo onde grava a mensagem recebida
//   (append, uma chamada por linha separada por "\n---\n").
// - OATHBOUND_FIXTURE_REPLY: texto a imprimir em stdout como resposta.
// - OATHBOUND_FIXTURE_WRITE_FILE / OATHBOUND_FIXTURE_WRITE_CONTENT: se
//   definidos, escreve esse conteúdo nesse caminho (relativo ao cwd) antes de
//   responder — simula o runner de implementação alterando o worktree.
const fs = require('node:fs');
const path = require('node:path');

const message = process.argv[process.argv.length - 1] || '';

const logPath = process.env.OATHBOUND_FIXTURE_LOG;
if (logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${message}\n---\n`);
}

const writeFile = process.env.OATHBOUND_FIXTURE_WRITE_FILE;
if (writeFile) {
  fs.mkdirSync(path.dirname(writeFile), { recursive: true });
  fs.writeFileSync(writeFile, process.env.OATHBOUND_FIXTURE_WRITE_CONTENT || '');
}

process.stdout.write(process.env.OATHBOUND_FIXTURE_REPLY || 'ACEITE: ok');
