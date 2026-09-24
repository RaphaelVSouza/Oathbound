# OpenCode

O instalador copia os seis agentes para `.opencode/agents/`. O OpenCode usa
esses arquivos no projeto e descobre a skill instalada em
`.claude/skills/agent-governance/`.

`ds-researcher` precisa das ferramentas `websearch` e `webfetch` disponíveis
na instalação OpenCode. Ele responde diretamente ao orquestrador e não edita
arquivos do projeto.

Invoque todos os agentes pelo `ds-run.sh`: `-R` para `ds-explorer`,
`ds-researcher` e `ds-reviewer`; `-s <glob>` para `ds-runner`, `ds-governance`
e `ds-mutant`. O modo de leitura exige `edit: deny` no agente e acusa qualquer
mudança observada no worktree durante a chamada. Se outro processo editar ao
mesmo tempo, o recibo não atribui automaticamente a autoria.

Configure o modelo no projeto ou defina `GOVKIT_MODEL` ao chamar os scripts.
Os agentes do pacote não incluem provedor nem modelo fixo. O wrapper
`ds-run.sh` procura agentes em `.opencode/agents/`; `GOVKIT_AGENT_DIR` só deve
ser usado quando esse diretório alternativo também for descoberto pelo
OpenCode.

Permissões por `bash` casam o texto do comando e não substituem isolamento
do processo. Revise os padrões de `read` e `edit` para os segredos do projeto
antes de permitir execução. A skill e os agentes instalados devem ser
versionados junto ao projeto para que o diff de atualização seja visível.

Documentação oficial: [agentes](https://opencode.ai/docs/agents) e
[skills](https://opencode.ai/docs/skills).
