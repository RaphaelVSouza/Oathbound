# OpenCode

O instalador copia os dez agentes para `.opencode/agents/`. O OpenCode usa
esses arquivos no projeto e descobre a skill instalada em
`.claude/skills/oathbound/`.

## Início com o oathkeeper

Inicie a sessão com o `oathkeeper` como agente primário: ele é o oathkeeper
da guilda, não edita nem commita e delega por
`node oathbound/scripts/run.js` e `queue.js`. Selecione-o no menu de agentes do
OpenCode ou passe-o diretamente. Os demais agentes têm `mode: subagent` e são
invocados pelo `run.js`; `oathkeeper` é o único `mode: primary` e não é
delegável.

`sage` precisa das ferramentas `websearch` e `webfetch` disponíveis
na instalação OpenCode. Ele responde diretamente ao oathkeeper e não edita
arquivos do projeto.

Invoque os agentes pelo `node .claude/skills/oathbound/scripts/run.js` (OpenCode
é o runner padrão, equivalente a `-u opencode`): `-R` para `cartographer`,
`sage`, `assayer` e `warden`; `-s <glob>` para `smith`, `scribe`, `bard`,
`gremlin` e `archivist`. O modo de leitura exige `edit: deny` no agente e acusa qualquer
mudança observada no worktree durante a chamada. Se outro processo editar ao
mesmo tempo, o recibo não atribui automaticamente a autoria.

`archivist` seleciona hunks e cria commits usando os auxiliares do kit.
Sua chamada tem posse exclusiva do Git. `-Q status|bloqueios|evidencias|entrega`
com `-S <sessão>` envia uma pergunta pronta a qualquer agente após a chamada
atual terminar, com escrita e shell bloqueados nessa consulta.

Configure o modelo no projeto ou defina `OATHBOUND_MODEL` ao chamar os scripts.
Os agentes do pacote não incluem provedor nem modelo fixo. O wrapper
`run.js` procura agentes em `.opencode/agents/`; `OATHBOUND_AGENT_DIR` só deve
ser usado quando esse diretório alternativo também for descoberto pelo
OpenCode.

Permissões por `bash` casam o texto do comando e não substituem isolamento
do processo. Revise os padrões de `read` e `edit` para os segredos do projeto
antes de permitir execução. A skill e os agentes instalados devem ser
versionados junto ao projeto para que o diff de atualização seja visível.

Documentação oficial: [agentes](https://opencode.ai/docs/agents) e
[skills](https://opencode.ai/docs/skills).
