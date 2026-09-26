# Aprendizados de orquestradores similares — pendentes de investigação

Origem: pesquisa em repositórios GitHub com premissa comparável (governar CLIs
de agente sem chamar LLM direto). Ver lista completa e comparação em
[gaps.md](gaps.md) ou na conversa que gerou este relatório. Ponto #3 (revisão
cega no `assayer`) já foi implementado; os demais seguem aqui para decisão
futura.

## #1 — Git worktree por execução, em vez de snapshot

**Observado em:** `vkotios/cli-agentic-coordinator`, `Patrick-Loves-Espresso/scope`, `nwiizo/ccswarm`.

Hoje o Oathbound audita escopo por snapshot Git (compara antes/depois no
mesmo working tree). Esses projetos isolam cada execução em uma worktree
dedicada (`git worktree add`), rodando o agente num diretório fisicamente
separado do restante do repositório.

**Ganho potencial:** elimina a classe de conflito onde duas execuções tocam o
mesmo working tree ao mesmo tempo (fila serial hoje evita isso, mas qualquer
evolução para execução paralela precisaria desse isolamento). Também dá
rollback trivial (descartar a worktree) sem depender de `git checkout`/`git
clean` no repositório principal.

**Custo/risco a avaliar:** overhead de criar/destruir worktree por tarefa;
scripts (`run.js`, `queue.js`, `store.ts`) precisariam gerenciar o ciclo de
vida da worktree; runners (`opencode.ts`, `claude.ts`, etc.) precisariam
rodar apontando para o caminho da worktree, não a raiz do projeto.

## #2 — Containment check pós-review

**Observado em:** `vkotios/cli-agentic-coordinator`.

Depois que o `assayer` (ou revisor equivalente) roda em modo read-only,
o projeto de referência verifica se a cópia de revisão OU o repositório
principal sofreram alteração inesperada durante o processo de revisão em si
— não só se a implementação ficou dentro do escopo.

**Ganho potencial:** camada extra de garantia sobre a garantia — hoje o
Oathbound confia que `assayer` é read-only pela permissão (`edit: deny`,
`bash` restrito a `git diff/status/show/log -p`). Um containment check
adicionaria verificação factual (hash ou `git status --short` antes/depois
da chamada de revisão) em vez de só confiar na declaração de permissão.

**Custo/risco a avaliar:** onde plugar a checagem (`run.js`? `oathkeeper`
via `SKILL.md`?); o que fazer se a checagem falhar (hoje não há esse
código de saída/estado).

## #4 — Gates humanos explícitos com hash + commit

**Observado em:** `Patrick-Loves-Espresso/scope`.

O projeto de referência formaliza duas aprovações humanas registradas por
hash de conteúdo e commit Git: Gate 1 aprova escopo/plano antes de
implementar; Gate 2 aprova o diffstat exato contra a estimativa antes do
merge. A aprovação vira dado auditável, não só "usuário disse ok no chat".

**Ganho potencial:** hoje a decisão do `oathkeeper` (aprovar/retornar/escalar)
fica registrada só no recibo em texto da conversa. Um gate com hash de
conteúdo tornaria essa aprovação verificável/rastreável fora da sessão de
chat (ex.: em log estruturado ou nota de commit).

**Custo/risco a avaliar:** já existe fila em SQLite (`store.ts`) — verificar
se dá para anexar campo de aprovação com hash sem redesenhar o schema;
decidir se isso é write extra do `oathkeeper` (que hoje não edita nada) ou
de um script.

## #5 — Fila com claims atômicos multi-worker

**Observado em:** `nutthouse/NEEDLE`.

O projeto de referência usa SQLite com "atomic claims": múltiplos workers
headless podem reivindicar tarefas da mesma fila concorrentemente sem
corrida. O Oathbound já tem fila SQLite com transações ACID
(`store.ts`/`queue.js`) — falta confirmar explicitamente se o desenho atual
já suporta múltiplos workers reivindicando em paralelo, ou se é
estritamente serial (um agente por vez).

**Ganho potencial:** se hoje é serial, isso é a diferença entre "fila
segura para um worker" e "fila segura para N workers" — relevante caso o
projeto queira paralelizar execução de agentes no futuro.

**Custo/risco a avaliar:** primeiro passo é investigação, não implementação
— ler `store.ts`/`queue.js` e confirmar o desenho real antes de decidir se
vale mudar algo.

## #6 — Ledger append-only replayável

**Observado em:** `nwiizo/ccswarm` (NDJSON: replay, diff, rollback).

Histórico de execução como dado estruturado consultável (um evento por
linha, formato fixo), em vez de log de texto livre.

**Ganho potencial:** permitiria reconstruir "o que aconteceu" numa fila ou
sessão sem reprocessar texto de log; suporta ferramentas de replay/auditoria
futuras.

**Custo/risco a avaliar:** possível sobreposição com o que a fila SQLite já
guarda — avaliar se um ledger separado é redundante ou complementar antes
de propor.
