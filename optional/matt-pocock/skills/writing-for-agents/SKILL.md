---
name: writing-for-agents
description: Escreve e revisa AGENTS.md, CLAUDE.md, skills e documentos consumidos por agentes, com fonte de verdade clara e instruções verificáveis.
---

# Escrita para agentes

Antes de editar, identifique qual arquivo é a fonte de verdade e quem o lê.
Coloque regras específicas perto do código ou fluxo a que se aplicam. Use o
arquivo raiz como índice curto para essas regras. Evite duplicar a mesma norma
em vários documentos; use links precisos.

Escreva instruções positivas e acionáveis: gatilho, ação, limite e critério de
conclusão. Diferencie regra obrigatória de exemplo. Declare caminhos e comandos
somente depois de conferir que existem. Ao mudar uma regra, atualize seus
ponteiros e retire instruções obsoletas.

Depois da edição, releia a cadeia de leitura de um agente novo: entrada do
projeto, documento apontado e regra específica. Confira que ela basta para
executar a tarefa sem depender de memória de conversa ou estado oculto.
