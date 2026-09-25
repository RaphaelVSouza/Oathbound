# Commits delegados

Chame `archivist` quando a entrega já foi revisada e o usuário pediu commits.
Passe caminhos ou globs autorizados em `-s` e informe a intenção da entrega na
mensagem. O agente escolhe os hunks e os grupos; o orquestrador recebe hashes e
pendências. Dispare em série, após encerrar chamadas de edição. A posse Git do
committer bloqueia outras chamadas de edição enquanto ele trabalha.

```sh
node .claude/skills/agent-governance/scripts/run.js -d . -a archivist -s 'src/*' -s 'README.md' -- 'Crie commits para a entrega X; ticket Y se aplicável.'
```

O agente usa `git-stage.js --list` para enumerar hunks e linhas alteradas de
cada arquivo. `--hunks 1,3`, `--lines 2,5` ou `--all` preparam o grupo;
`git-commit.js` recusa commit
com qualquer caminho preparado fora dos `-s`. Conteúdo previamente preparado
fora do escopo exige intervenção do orquestrador antes da chamada. O wrapper
compara worktree, índice e caminhos dos commits criados para sinalizar alterações
fora do escopo. Um exit `3` exige conferência do recibo e do histórico.

O agente não faz push, amend ou rebase. Essas ações dependem de uma instrução
explícita ao orquestrador. A fila de issues não cria commits automaticamente.
