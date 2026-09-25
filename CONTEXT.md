# Agent Governance Kit

Pacote reutilizável de delegação, auditoria e orquestração de agentes autônomos OpenCode com controle de escopo e mutação Git.

## Language

**Agent**:
Um papel especializado de IA que executa tarefas delimitadas (como exploração, pesquisa, codificação, revisão ou commits).
_Avoid_: Bot, Worker, Assistente

**Scope**:
Padrão glob que define os caminhos que um agente tem autorização explícita para criar ou modificar no repositório.
_Avoid_: Limite, Permissão genérica

**Claim**:
Reserva de posse exclusiva de um padrão de escopo por um processo de agente ativo para evitar conflitos concorrentes.
_Avoid_: Trava de arquivo, Mutex de SO

**Session**:
Execução rastreada de um agente, demarcada por identificador único, limites de timeout, registro de PIDs e auditoria de estado do Git antes e depois da chamada.
_Avoid_: Thread, Prompt isolado

**Git Module**:
Módulo profundo que encapsula a inspeção de estado do repositório, fatiamento seletivo de hunks e criação de commits com checagem de escopo.
_Avoid_: Git wrapper, Script de Git

**Audit Engine**:
Motor estático in-process de validação de integridade documental, links, tabelas e tokens contratuais.
_Avoid_: Linter de docs, Validador markdown

**Audit Source**:
Abstração de leitura sobre o sistema de arquivos ou o índice do Git para inspeção estática sem acoplamento a SO.
_Avoid_: File provider, Git reader

**Process Runner**:
Módulo profundo de execução assíncrona de subprocessos com controle de tempo, encerramento de árvores e isolamento de particularidades de SO.
_Avoid_: Exec, Spawn wrapper

**Governance Store**:
Módulo transacional baseado em `node:sqlite` para persistência atômica de estados da fila, estágios de issues e reservas concorrentes de escopo (claims).
_Avoid_: Banco de dados genérico, Estado em arquivo texto

