# Changelog

## [0.50.0-alpha.1] - 2026-11-15
- Reconstrução pública do Oathbound para Claude Code e Antigravity CLI (`agy`), remoção do legado, empacotamento como plugin nativo e novo instalador com desativação de skills duplicadas.

## 2026-11-14 (encerra experimentos de roteamento com Jev)

- ADRs 0001 e 0002 encerrados. Os protótipos de sugestão de skills e agentes seguem inativos.
- Revisão de testes com Jev segue sob demanda (ADR 0003). Testes locais do protótipo de roteamento conferem a probabilidade e o `Noul` do candidato escolhido e a saída para pedidos inelegíveis.

## 2026-11-14 (renomeia agente de testes E2E)

- Agente `qa` passa a `tester` no Claude Code. Contrato e caso de regressão usam o nome novo. A sincronia continua usando `qa` no Codex e no Gemini.

## 2026-11-14 (renomeia agente documental)

- Agente `docs` passa a `scribe` no Claude Code. Contratos e casos de regressão usam o nome novo. Sincronia continua usando `docs` no Codex e no Gemini.

## 2026-11-14 (Jev na revisão de testes)

- ADR 0003 e CLI manual `tests/jev/revisar-teste.js`. Uma pergunta `Noul` por critério de aceite, com alerta, faixa inconclusiva e saída de indisponibilidade. Testes com transporte simulado.
- Calibração preliminar com Jev 1.14.0 em 18 casos sintéticos de calibração e 18 de conferência. Limiar de alerta passou a 0,81; `sem_alerta` mantém 0,30. Corpus, medidor e resultados no ADR 0003.

## 2026-11-14 (regressão RTK)

- `node tests/rtk/rg.test.js`: valida offline a reescrita de buscas no hook, a compactação de resultados e a preservação de evidência em buscas focadas. No Windows, compara busca com e sem `PATHEXT`.

## 2026-11-14 (custo e turnos por prompt)
- Geração atualiza `por-prompt.json` e cria `rotulos.csv` só quando falta. `correcao_seguinte` considera apenas o próximo prompt humano no mesmo transcrito. Testes cobrem regeneração com notas e fronteira entre duas sessões.
- `tests/dificuldade/por-prompt.js`: junta a segmentação por prompt humano (filtro de `extrair.js`) com a precificação de `custo.js` (`precos.json`; `custo.js` passa a exportar `achaPreco`, `extrairTokens`, `precificar`, `listarJsonl`; CLI igual). Por prompt: mensagens (dedup por `message.id`), ferramentas (total e por nome), arquivos editados distintos, subagentes, turnos, US$ da principal e dos subagentes, `irreversivel` (só booleano e categoria, nunca o comando), `correcao_seguinte` (**heurística fraca**: palavra-chave nos 80 primeiros chars do prompt seguinte).
- Sidechain liga ao prompt por `promptId` (1ª linha de cada `subagents/*.jsonl` = linha humana da principal); sem ligação, não entra no custo e é contada à parte.
- Grava `state/dificuldade/por-prompt.json` (id = sha256 8 hex, sem texto) e `rotulos.csv` (até 60 prompts embaralhados, texto redigido e truncado a 240, sem custo, rótulo vazio) para rotulagem às cegas. `--correlacao`: Spearman rótulo×custo e rótulo×turnos, subestimação (rótulo 1 ou 2 com custo acima do Q3), veredito (descartar se Spearman < 0,4 ou subestimação > 15%). n=60 dá IC ~±0,2.
- Teste: `node tests/dificuldade/por-prompt.test.js` (fixtures em `CUSTO_HOME`).

## 2026-11-14 (refino do modo subagente do Jev)
- `hooks/skill-suggest.js`, modo `subagente`: opção `inline` no `Choice` (sem `Noul`; escolhida, fica calado e loga `inline: true`); `criteria` estruturado por `Noul` (`true.faz`, `false.nao_faz` com `PARES_CONFUNDIDOS`); faixas do `Noul`: >= 0,7 sugere, <= 0,3 cala, meio cala e loga `faixa: 'meio'`. `LIMIAR_NOUL_SUB_ALTO` e `LIMIAR_NOUL_SUB_BAIXO` substituem `LIMIAR_NOUL_SUB`. Testes ampliados.
- ADR 0002: seção "Emenda 2026-11-14" e linha "Estado" atualizada. Limiares sem calibração; **não registrado** em `settings.json`.
- Correção posterior: `Choice` do modo subagente passa a exigir `probabilities[escolhido]` >= 0,5 (`LIMIAR_PROB_SUB`) em vez de `confidence`, conforme `confidence.md`. Teste cobre `confidence` ignorado.

## 2026-11-14 (implementação Jev: roteamento de subagente)
- ADR 0002 passo 1: `description` dos 7 `agents/*.md` reescritas de forma contrastiva (o que faz, quando usar, o que não faz; pares `smith`/general-purpose, `scholar`/claude-code-guide, `assayer`/`sentinel`). Suíte `tests/agents/executar.js`: 12/12, US$ 0,063.
- ADR 0002 passo 2: `hooks/skill-suggest.js` com modo `SKILL_SUGGEST_MODO=subagente`: 1 `Choice` + 1 `Noul` por subagente (12 itens: 7 locais + 5 embutidos) em um request; sugere se confiança e `Noul` >= 0,5 (sem calibração). Bloco `<subagent_relevance>`; log com `modo` e sem o prompt. Testes ampliados. Escrito pelo `smith`.
- **Não registrado** em `settings.json`: critério de aceite do ADR (100 prompts humanos com subagente, calibração) não cumprido.

## 2026-11-14 (protótipo de sugestão de skill com o Jev)
- ADR `docs/adr/0001-sugestao-de-skill-com-jev.md` (proposto) e protótipo `hooks/skill-suggest.js` (`UserPromptSubmit`). **Não registrado** em `settings.json`: registro só após o critério de aceite do ADR.
- Um request ao Jev `jev-1.14.0` (`Choice` sobre as 44 skills + 2 `Noul`), prompt redigido por `redigir()`, falha em silêncio, log sem o prompt em `state/skill-suggest.jsonl`.
- ADR `docs/adr/0002-roteamento-de-subagentes-com-jev.md` (proposto): perguntas por subagente, limiares por catálogo, gatilho de 100 prompts com subagente (hoje 11). Fine-tuning do Jev não existe na oferta da TypeSafe.
- `.gitignore`: libera `docs/`.
- Medição (121 prompts reais, `tests/skill-suggest/extrair.js` e `medir.js`, resultados em `state/`): skills inconclusivo (1 carga real); subagentes 6 de 11 no 1º (55%). Critério de aceite não cumprido, hook segue sem registro. Detalhe no ADR.
- Teste: `node hooks/skill-suggest.test.js` (sem rede, transporte injetado). Chamada real com 3 prompts genéricos: 227 a 423 ms; sugeriu `grill-me` e `caveman:caveman-review`, e nada para pergunta factual.

## 2026-11-14 (custo em dólar por modelo)
- `tests/custo/custo.js [AAAA-MM] [--json] [--sessao <id>]`: lê `projects/**/*.jsonl` (inclui `subagents/`), deduplica por `message.id` (58 de 80 ids repetem no transcrito; somar linhas dobra o custo) e soma US$ por mês, modelo e origem (principal/subagente). Mostra cache hit, decomposição do custo e contrafactual de subagentes a preço do modelo principal.
- `tests/custo/precos.json`: Sonnet 5.5, Opus 5.5, Haiku 5.5 (tabela do skill `claude-api`, 2026-11-03). **Estimados**: cache write 5m (1,25×) e 1h (2×) dos três modelos; Haiku cache read e faixa acima de 100K. Saída avisa.
- Teste: `node tests/custo/custo.test.js` (fixtures em `CUSTO_HOME`; saída sem texto de prompt).
- Medição 2026-11-14: todos os transcritos US$ 30,83 (922 msgs, cache hit 96,6%); subagentes US$ 2,06 contra US$ 10,08 a preço do Opus. Escrito pelo `smith`.

## 2026-11-14 (validação assayer e sentinel)
- Validação do commit `ad10103` por `assayer` (0 🔴, 9 🟡) e `sentinel` (0 🔴, 3 🟡, 11 🔵). Corrigido:
  - Payload ilegível, grande ou lento não apaga mais a chamada da trilha: grava linha com `erro` (`payload_invalido`, `payload_grande`, `stdin_lento`), só com identificadores extraídos do texto bruto, sem conteúdo.
  - Redação: JSON com aspas escapadas, cabeçalhos `Authorization`/`Cookie`/`Set-Cookie`, `-passin pass:`, nomes `passphrase`/`signature`/`cookie`/`dsn`, prefixos `ya29.`, `npm_`, `hf_`, `shpat_`, `dop_v1_`, `sntrys_`, webhook do Slack e corpo de PEM.
  - `audit-resumo.js`: negação sem a linha da chamada (órfã) entra como chamada e a ferramenta aparece; taxa nunca passa de 1; novos campos `orfas` e `erros`.
  - Testes: ReDoS com limite de 2 s e entradas de 4096 caracteres; trava abandonada (`utimesSync`); rename que falha (`.2` como pasta); 14 formatos novos; payload ilegível por stdin.
- Fica no `BACKLOG.md`: falsos positivos de redação em flags, senha de URL com `/`, modo de arquivo, `O_NOFOLLOW`, retenção, TOCTOU raro da trava.

## 2026-11-14 (auditoria do agent-audit.js)
- Auditoria Opus (`assayer`) do `hooks/agent-audit.js`: 1 bug e 10 riscos. Corrigidos:
  - Redação: chave entre aspas, flag com valor separado por espaço, valor com espaço entre aspas, Stripe `sk_live_`, `github_pat_`, `glpat-`, `xox*-`, `ASIA`, JWT, `Basic`, `curl -u`, `https://user:senha@`, `mysql -p`, `sshpass -p`. Caminho de URL com token mascarado. Entrada limitada a 4096 caracteres e quantificadores a 64 (ReDoS quadrático).
  - Rotação: trava por arquivo; aborta em erro que não seja `ENOENT` (antes `EPERM` no Windows perdia geração). `extra` só aceita `bloqueado` e `motivo`. Entrada: timer de 3 s, handler de erro no stdin.
  - `settings.json`: `timeout: 5` no hook global.
- Dúvida verificada no log real: chamada negada gera 2 linhas (hook global + guard, `bloqueado:true`), não intencional para a contagem. `audit-resumo.js` agora conta só a linha sem `bloqueado` como chamada; taxa = bloqueios / chamadas. Antes a negação inflava `chamadas` e reduzia a taxa.
- Testes: `agent-audit.test.js` (18 formatos de segredo, 5 entradas adversariais com limite de 500 ms, rotação até `.2`, trava, entrada por stdin) e `audit-resumo.test.js`. O teste novo falha na versão antiga.

## 2026-11-14 (CLAUDE.md enxuto)
- `CLAUDE.md` global de cerca de 40 para 13 linhas. Removidos: lista de modelos por subagente (duplicava o `model:` do frontmatter) e seção de skills cíclicas (as descrições das skills já restringem a ativação).

## 2026-11-14 (sincronia e testes)
- Sincronia entre CLIs (L4): `tests/agents/regras-comuns.json` (regras `Segredos` e `Gate` por agente, trechos proibidos) e `tests/agents/sincronia.js` (verifica; `--aplicar` acrescenta o que falta em `~/.codex` e `~/.gemini`). Teste: `sincronia.test.js`. Achado: Codex e agy não tinham nenhuma regra de segredo nem gate; aplicado nos 7 agentes de cada.
- agy: removido o contorno `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM=NUL` de `assayer`, `sentinel`, `scout`, `smith` (burlava bloqueio e rodava em agentes somente leitura). Agora: parar e reportar. Reverter via `git revert`.
- Suíte: casos `smith-gate`, `docs-gate` e `ask-commit`.
- Remotos privados no GitHub: `claude-config`, `codex-config`, `gemini-config`.

## 2026-11-14 (um repositório por CLI)
- Versionados separadamente, cada um com `.gitignore` em lista permitida, `.gitattributes` e `README.md`. Sem remoto. Varredura de segredos nos arquivos staged: limpa.

## 2026-11-14 (remoto)
- `.gitattributes` (LF; `.ps1` CRLF): fim do aviso LF para CRLF.
- Remoto privado no GitHub (`origin`, branch `main`). Varredura de segredos no histórico: limpa.

## 2026-11-14 (Fase 7)
- Métricas (L3): `hooks/audit-resumo.js [AAAA-MM] [--json]` resume `state/agent-audit.jsonl` por mês e agente (execuções, chamadas, bloqueios, taxa, ferramentas, top motivos). Teste: `audit-resumo.test.js`.

## 2026-11-14 (Fase 6)
- RACI e gates (L7): `README.md` com dono, aprovador, ações irreversíveis e camadas de controle.
- `permissions.ask` para `git push`, `git commit`, `git reset --hard`, `rm`, `Remove-Item` (variantes `rtk`).

## 2026-11-14 (Fase 5)
- Suíte de regressão em `tests/agents/` (L5).
- RTK atualizado via script de atualização do ambiente.
- `CHANGELOG.md` e `BACKLOG.md`.

## 2026-11-14
- Trilha de auditoria (L3): `hooks/agent-audit.js` grava chamadas de subagentes em `state/agent-audit.jsonl`.
- Guard de somente leitura (L1): `hooks/readonly-guard.js` no `assayer` e no `sentinel`.
- Segredos (L6): regra nos agentes e `deny` de `Read(//**/.env*)` e `.credentials.json`.
- Baseline Git local (L4).
