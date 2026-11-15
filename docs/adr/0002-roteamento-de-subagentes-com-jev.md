# ADR 0002 — Roteamento de subagentes com o Jev

Data: 2026-11-14. Estado: **experimento encerrado**. A amostra ficou abaixo do mínimo previsto. As descrições dos agentes continuam em uso. O modo `subagente` permanece inativo.

## Contexto

O orquestrador (sessão principal) escolhe o subagente pelas `description` de `agents/*.md` e pelas regras do `CLAUDE.md`. O [ADR 0001](0001-sugestao-de-skill-com-jev.md) mediu o Jev `jev-1.14.0` nessa escolha, com o mesmo catálogo do hook de skills mais 4 subagentes embutidos (11 no total):

- 11 prompts com subagente real (de 121 elegíveis). O `Choice` acertou o 1º em 6 (55%), com intervalo de confiança de cerca de 25% a 83%.
- Confusões: `general-purpose` no lugar de `smith`; `scholar` no lugar de `claude-code-guide`.
- Com os limiares do cookbook de skills, sugeriu e acertou 4, sugeriu errado 3 e ficou calado 4. O `Noul` `acao` foi desenhado para skills e não discrimina subagentes.
- Sem subagente real, sugeriria em 50 de 110 prompts.

A TypeSafe não oferece fine-tuning nem treino customizado do Jev (documentação consultada em 2026-11-14). O que se controla é o que se envia: descrições das opções, perguntas e limiares.

## Desenho avaliado

1. **Catálogo e descrições contrastivas.** Reescrever a `description` de cada subagente dizendo o que faz e o que não faz, com foco nos pares confundidos. O texto serve ao orquestrador e ao Jev; é uma mudança em `agents/*.md`, sujeita à suíte `tests/agents/executar.js`.
2. **Uma pergunta por subagente**, no estilo do cookbook `function_calling`: um `Noul` ("este pedido é para o `smith`?") por opção, em um único request, mais um `Choice` entre os subagentes como desempate. Substitui o `Noul` `acao`.
3. **Limiares por catálogo**, escolhidos na curva de acerto contra cobertura de uma amostra de calibração e conferidos em outra amostra. Não reaproveitar os do cookbook de skills.
4. **Sem registro automático.** Só vira hook `UserPromptSubmit` (ou entrada no `CLAUDE.md`) se cumprir o critério de aceite. Reaproveita `hooks/skill-suggest.js` (redação de segredos, falha em silêncio, versão fixa, log sem o prompt).

## Tamanho de amostra previsto

O protocolo previa pelo menos **100 prompts humanos com subagente chamado**, separados em calibração (metade) e conferência (metade). A amostra observada teve 11. A fonte é `tests/skill-suggest/extrair.js` (campo `agentes`, vindo do `subagent_type` nos transcritos), não o `agent-audit.jsonl`, que registra o que o subagente fez e não quem o orquestrador escolheu.

## Critério de aceite (fixado antes de medir)

- Acerto do 1º no conjunto de conferência acima do acerto da escolha atual do orquestrador. A referência do orquestrador é o próprio `subagent_type` usado; para comparar, mede-se também um braço "sem sugestão" repetindo a decisão do orquestrador sem a dica, o que exige amostra com execução controlada e não só transcritos.
- Reportar separado: sugestão certa, sugestão errada e silêncio. Só aceitar se "quebrou" (sugestão errada onde o orquestrador acertaria) ficar abaixo de "corrigiu".
- Intervalo de confiança reportado; com menos de 100 prompts, o resultado é descartado como inconclusivo.
- Latência: p95 do hook abaixo do `timeout` configurado, com margem.

## Consequências

- Reescrever descrições melhora o roteamento mesmo sem o Jev, e é a parte barata e reversível. Pode ser feita antes, com a suíte de regressão como proteção.
- O hook envia o texto do prompt à TypeSafe, com as mesmas salvaguardas do ADR 0001.
- Risco de dica errada e confiante sobrescrever uma escolha certa do orquestrador (29 corrigidos contra 7 quebrados no cookbook de skills).

## Alternativas descartadas

- **Fine-tuning do Jev**: não existe na oferta da TypeSafe.
- **Ajustar descrições agora e declarar vitória com 11 prompts**: não tem poder estatístico; qualquer ganho pode ser ajuste à amostra.
- **Embeddings**: dependência e índice novos para 11 opções.

## Emenda 2026-11-14

Ajustes ao passo 2, no modo `subagente` de `hooks/skill-suggest.js` (modo `skill` intacto):

- **Opção `inline`** no `Choice`: "resolver na thread principal, sem delegar: resposta já conhecida ou edição trivial de 1 arquivo". Não tem `Noul`. Se o `Choice` escolhe `inline`, o hook fica calado e o log registra `inline: true`.
- **`criteria` estruturado** em cada `Noul` por subagente, no formato documentado da API (`criteria.true` e `criteria.false` aceitam objeto): `true: { faz }` com a descrição do agente e `false: { nao_faz }` com o par confundido (`PARES_CONFUNDIDOS`: smith e general-purpose, scholar e claude-code-guide, assayer e sentinel, scout e Explore). A `instructions` fica só com a pergunta.
- **Decisão por faixas** sobre o `Noul` do escolhido (fonte: docs.typesafe.ai/confidence.md): >= 0,7 sugere; <= 0,3 cala; entre os dois cala e registra `faixa: 'meio'`. O `Choice` não usa mais o campo `confidence` (mede concentração da distribuição, não chance de acerto; confidence.md:119): exige a probabilidade da opção escolhida (`probabilities[escolhido]`) >= 0,5, sem calibração. Conferido nas docs em 2026-11-14. O log ganha `faixa` (`alta`, `meio`, `baixa`). A ordem das opções segue embaralhada por prompt, por causa do viés de primeira opção (docs.typesafe.ai/model-jaggedness.md).
- **Custo estimado**: cerca de US$ 0,00015 por prompt (US$ 0,042 por Mtok de entrada, docs.typesafe.ai/models.md).
- **Encerramento**: a calibração (passo 3) e o registro (passo 4) foram descartados. O hook segue fora do `settings.json`.
