# Perguntas prontas às sessões

Guarde `sessao=<id>` do recibo de `run.js`. Após a chamada atual terminar,
consulte a mesma sessão com `-S` e `-Q`. O wrapper cria uma variante temporária
do agente sem permissão de edição nem shell para esta pergunta. A próxima
chamada de trabalho volta a usar o agente original.

```sh
node .claude/skills/oathbound/scripts/run.js -d . -a smith -S <id> -Q status
node .claude/skills/oathbound/scripts/run.js -d . -a smith -S <id> -Q bloqueios
node .claude/skills/oathbound/scripts/run.js -d . -a smith -S <id> -Q evidencias
node .claude/skills/oathbound/scripts/run.js -d . -a smith -S <id> -Q entrega
```

Troque `smith` pelo agente da sessão, inclusive `archivist`. Acrescente
`-- 'pergunta específica'` para detalhar a consulta. `-Q` não recebe `-s` e
não altera o worktree intencionalmente. Um exit `3` indica mudança observada
durante a leitura; confira a autoria. Não envie duas chamadas simultâneas ao
mesmo ID de sessão: a consulta é um acompanhamento entre etapas, não uma
interrupção segura de uma execução ainda ativa.
