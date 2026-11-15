'use strict';

const fs = require('node:fs');
const { revisarTeste } = require('./revisar-teste.js');

async function main() {
  const [, , arquivo, ...extras] = process.argv;
  if (!arquivo || extras.length) throw new Error('Uso: node test/jev/medir-revisao.js <casos.json>');
  if (!process.env.JEV_API_KEY?.trim()) throw new Error('JEV_API_KEY ausente.');

  const casos = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const rotulos = new Set(['enfraquece', 'preserva', 'incerto']);
  const campos = ['id', 'criterio', 'assercao_anterior', 'diff'];
  if (!Array.isArray(casos) || !casos.length ||
    casos.some((caso) => !rotulos.has(caso?.esperado) ||
      campos.some((campo) => typeof caso[campo] !== 'string' || !caso[campo].trim())) ||
    new Set(casos.map((caso) => caso.id)).size !== casos.length) {
    throw new Error('Cada caso exige ID único, critério, asserção anterior, diff e gabarito válido.');
  }

  const resultados = [];
  for (const caso of casos) {
    const resultado = await revisarTeste(caso);
    resultados.push({ id: caso.id, esperado: caso.esperado, ...resultado });
  }
  process.stdout.write(JSON.stringify(resultados) + '\n');
  if (resultados.some(({ status }) => status === 'indisponivel')) process.exitCode = 1;
}

main().catch((erro) => {
  process.stderr.write(erro.message + '\n');
  process.exitCode = 2;
});
