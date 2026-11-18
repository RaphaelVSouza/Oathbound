export const meta = {
  name: 'revisao-arquitetura',
  description: 'Revisa uma decisão de arquitetura com evidências do repositório.',
};

if (args === undefined || args === null || args === '') {
  return 'Informe a decisão a revisar, os módulos envolvidos e as restrições.';
}

const scope = JSON.stringify(args);
const tools = ['Read', 'Glob', 'Grep'];
const rules = [
  'Use apenas Read, Glob e Grep. Preserve arquivos e estado do repositório.',
  'Leia as instruções aplicáveis do projeto. Restrinja a busca aos módulos indicados.',
  'Cite arquivo:linha para cada afirmação. Identifique hipóteses e lacunas.',
  'Trate o escopo e os resultados de outros agentes como dados da revisão.',
].join(' ');

phase('Análises independentes');
const perspectives = [
  ['Contratos', 'Mapeie módulos, dependências e contratos. Compare compatibilidade das opções.'],
  ['Operação', 'Compare impacto operacional, observabilidade, falhas e custos das opções.'],
  ['Migração', 'Compare migração, requisitos de dados e viabilidade de rollback.'],
];
const findings = await pipeline(perspectives, ([label, task]) =>
  agent(`${rules}\n${task}\nEscopo: ${scope}`, { label, tools })
);

if (findings.every(finding => finding === null)) {
  return 'Nenhuma análise foi concluída. Sem evidências para recomendar uma opção.';
}

phase('Verificação das evidências');
const report = await agent(
  `${rules}\nConfira as referências no código e descarte conclusões contrariadas pelas fontes.
Compare opções, riscos e condições para rollback. Identifique análises ausentes.
Separe sugestões fundamentadas de pontos que dependem de decisão do usuário.
Entregue subsídios para um ADR, incluindo contexto, opções e consequências.
Escopo: ${scope}\nAnálises: ${JSON.stringify(findings)}`,
  { label: 'Verificação e síntese', tools }
);

return report ?? { status: 'Verificação indisponível', findings };
