# OpenCode

O instalador copia os oito agentes para `.opencode/agents/`. O OpenCode usa
esses arquivos no projeto e descobre a skill instalada em
`.claude/skills/agent-governance/`.

`ds-researcher` precisa das ferramentas `websearch` e `webfetch` disponíveis
na instalação OpenCode. Ele responde diretamente ao orquestrador e não edita
arquivos do projeto.

Invoque os agentes pelo `node .claude/skills/agent-governance/scripts/ds-run.js` (OpenCode
é o runner padrão, equivalente a `-u opencode`): `-R` para `ds-explorer`,
`ds-researcher`, `ds-reviewer` e `ds-security`; `-s <glob>` para `ds-runner`, `ds-governance`,
`ds-mutant` e `ds-committer`. O modo de leitura exige `edit: deny` no agente e acusa qualquer
mudança observada no worktree durante a chamada. Se outro processo editar ao
mesmo tempo, o recibo não atribui automaticamente a autoria.

`ds-committer` seleciona hunks e cria commits usando os auxiliares do kit.
Sua chamada tem posse exclusiva do Git. `-Q status|bloqueios|evidencias|entrega`
com `-S <sessão>` envia uma pergunta pronta a qualquer agente após a chamada
atual terminar, com escrita e shell bloqueados nessa consulta.

Configure o modelo no projeto ou defina `GOVKIT_MODEL` ao chamar os scripts.
Os agentes do pacote não incluem provedor nem modelo fixo. O wrapper
`ds-run.js` procura agentes em `.opencode/agents/`; `GOVKIT_AGENT_DIR` só deve
ser usado quando esse diretório alternativo também for descoberto pelo
OpenCode.

Permissões por `bash` casam o texto do comando e não substituem isolamento
do processo. Revise os padrões de `read` e `edit` para os segredos do projeto
antes de permitir execução. A skill e os agentes instalados devem ser
versionados junto ao projeto para que o diff de atualização seja visível.

Documentação oficial: [agentes](https://opencode.ai/docs/agents) e
[skills](https://opencode.ai/docs/skills).
