# ADR 0001 — Sugestão de skill por prompt com o Jev

Data: 2026-11-14. Estado: **experimento encerrado**. Critério de aceite não cumprido. O protótipo segue inativo em `hooks/skill-suggest.js`.

## Contexto

O agente vê só descrições truncadas das skills e às vezes carrega a errada ou carrega uma sem necessidade. O cookbook `skill_suggestion` da TypeSafe (<https://docs.typesafe.ai/cookbooks/skill_suggestion.md>) mede, em 452 pedidos com `claude-haiku-4-5` e 194 skills: carga errada de 15,7% para 7,9% e carga desnecessária de 14,0% para 5,2%. Na mesma medição a sugestão corrigiu 29 casos e quebrou 7: uma sugestão errada e confiante pode sobrescrever uma decisão certa. Os números são deles, com outro catálogo e outro idioma.

O Jev (System One) devolve respostas tipadas, não texto. Já é usado em pipelines de curadoria de dados, com a mesma chave `JEV_API_KEY` e o mesmo endpoint. A chave foi validada em 2026-11-14. Não existe versão acima de `jev-1.14.0` (changelog e `/v1/models`).

## Desenho avaliado

1. **Hook `UserPromptSubmit`** em `hooks/skill-suggest.js` injeta no máximo uma linha `<skill_relevance>` como contexto adicional. O agente decide sozinho; a linha é dica.
2. **Um request por prompt**, com três perguntas: `Choice` sobre o catálogo (qual skill), `Noul` `acao` (exige ação ou procedimento) e `Noul` `nomeia` (nomeia ferramenta, formato ou método). Só sugere se `acao >= 0,3` ou `nomeia >= 0,5` **e** `confidence` do `Choice >= 0,5`. O cookbook usa dois requests (rerank do top 3); fica como alternativa se a medição mostrar que um não basta. O catálogo local tem 44 skills, contra 194 no cookbook.
3. **Catálogo lido do disco**: `skills/*/SKILL.md` (menos `_*`) e a versão mais recente de cada plugin em `plugins/cache`. Descrição limitada a 300 caracteres.
4. **Ordem das opções embaralhada** por prompt (hash do texto), para controlar o viés de primeira opção do `Choice`.
5. **Versão fixa `jev-1.14.0`**, registrada no log.
6. **Falha em silêncio**: sem chave, sem rede, timeout de 4 s, HTTP de erro ou resposta inválida não injetam nada e não bloqueiam o prompt. Prompt com menos de 15 caracteres ou que começa com `/` não é enviado.
7. **Privacidade**: o texto vai ao serviço externo depois de `redigir()` (a mesma redação de segredos do `agent-audit.js`) e truncado em 2000 caracteres. O log `state/skill-suggest.jsonl` guarda skill, confiança, probabilidades, tamanho e modelo, **nunca o prompt**.

Limiares são as constantes do cookbook, sem calibração nesta base.

## Critério de aceite (fixado antes de medir)

- Amostra de prompts reais do `history.jsonl` analisada para validação de privacidade antes de qualquer envio (o arquivo pode ter dado sensível), com a skill que de fato foi carregada como referência, e prompts em que nenhuma skill foi carregada.
- Reportar separado: carga errada, carga desnecessária e sugestão que contradiz a escolha certa do agente. Só aceitar se a taxa de "quebrou" ficar abaixo da de "corrigiu".
- Latência medida: p50 e p95 do hook. Registro no `settings.json` só com p95 abaixo do `timeout` configurado, com margem.
- Limiares escolhidos na curva da amostra e conferidos em amostra separada.

## Resultado da medição (2026-11-14)

Amostra: 121 prompts humanos elegíveis dos transcritos (`tests/skill-suggest/extrair.js`, `medir.js`), `jev-1.14.0`, 0 erros. Referência: o que o agente fez de fato.

- **Skills: inconclusivo.** Só 1 prompt carregou skill (`typesafe:typesafe-ai`, e o Jev sugeriu essa, confiança 1,00). Sem referência não há como medir carga errada ou desnecessária. O hook sugeriria em 48 de 121 prompts (40%), dominado por `caveman:*`.
- **Subagentes: fraco.** Em 11 prompts com subagente, o `Choice` acertou o 1º em 6 (55%); com os limiares atuais, sugeriu e acertou em 4, sugeriu errado em 3 e ficou calado em 4 (`confidence` baixa). Confusões: `general-purpose` no lugar de `smith`; `scholar` no lugar de `claude-code-guide`. Sem subagente real, sugeriria em 50 de 110 prompts. Intervalo de confiança de 6/11 é largo (cerca de 25% a 83%).
- **Limites da amostra:** poucos prompts, uma pessoa, catálogo de 11 subagentes (o cookbook usa 194 skills). Os limiares são os do cookbook e `acao` não faz sentido para subagentes.

Conclusão: encerrar o experimento. A amostra não demonstrou benefício suficiente para adicionar latência e enviar prompts a um serviço externo. O hook segue fora do `settings.json`.

## Consequências de uma eventual ativação

- Cada prompt elegível faz uma chamada externa (latência e custo pequenos, sem ledger) e envia texto do usuário à TypeSafe.
- Dependência de `JEV_API_KEY` no ambiente; sem ela o hook não faz nada.
- Reversível: remover a entrada do hook em `settings.json`.

## Alternativas descartadas

- **Sem sugestão** (estado atual): mantém o erro de carga medido no cookbook.
- **Embeddings**: dependência e índice novos para um catálogo pequeno.
- **Dois requests como no cookbook**: mais latência sem evidência, nesta base, de que um request não basta.
