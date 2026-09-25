# Copia a versão atual para um repositório Git, ou globalmente para o perfil
# do usuário, sem sobrescrever arquivos de projeto (o modo -Global sobrescreve
# agentes da guilda por design — ver README). -Upgrade libera substituir uma
# instalação -Global já existente (fonte da skill e auditor) para sincronizar
# com a versão atual do repositório; mesmo ponto de entrada serve instalação
# e atualização.
[CmdletBinding(DefaultParameterSetName = 'Project')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Project')]
    [string]$Project,
    [Parameter(Mandatory = $true, ParameterSetName = 'Global')]
    [switch]$Global,
    [string]$Runner = 'opencode',
    [switch]$AuditDocs,
    [switch]$Upgrade
)

$ErrorActionPreference = 'Stop'

if ($Global) {
    # Fonte única e agnóstica de CLI em ~/.oathbound/. Cada CLI com
    # diretório de skills conhecido (Claude Code, Codex) recebe um symlink
    # apontando pra essa fonte — não uma cópia — para que a skill fique
    # invocável (/oathbound, $oathbound) nativamente em cada
    # host, sem duplicar arquivos nem arriscar drift entre cópias.
    $projectPath = $HOME
    $skillTarget = Join-Path $HOME '.oathbound'
    $auditTarget = Join-Path $HOME '.oathbound/tools'
} else {
    $projectPath = (Resolve-Path -LiteralPath $Project).Path
    $gitRoot = (& git -C $projectPath rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitRoot)) {
        throw "O projeto precisa ser um repositório Git: $projectPath"
    }
    $resolvedRoot = [IO.Path]::GetFullPath($gitRoot.Trim()).TrimEnd('\', '/')
    $resolvedProject = [IO.Path]::GetFullPath($projectPath).TrimEnd('\', '/')
    if ($resolvedRoot -ine $resolvedProject) {
        throw "Passe a raiz do repositório Git: $resolvedRoot"
    }
    $skillTarget = Join-Path $projectPath '.claude/skills/oathbound'
    $auditTarget = Join-Path $projectPath 'tools'
}

$skillSource = Join-Path $PSScriptRoot 'skill'
$agentsSource = Join-Path $PSScriptRoot 'guild'
$agentFiles = @(Get-ChildItem -LiteralPath $agentsSource -File -Filter '*.md')
if ($Upgrade -and -not $Global) {
    throw '-Upgrade só se aplica a -Global; o modo -Project nunca sobrescreve automaticamente (ver README).'
}

$collisions = @()

# Detecção de instalação antiga (agent-governance-kit). Não remove nada; apenas
# interrompe e lista os caminhos para decisão manual.
$legacyPaths = @()
if ($Global) {
    $legacyPaths += @(
        (Join-Path $HOME '.agent-governance-kit'),
        (Join-Path $HOME '.claude/skills/agent-governance'),
        (Join-Path $HOME '.codex/skills/agent-governance'),
        (Join-Path $HOME '.gemini/config/skills/agent-governance')
    )
    foreach ($legacyAgentDir in @(
            (Join-Path $HOME '.config/opencode/agents'),
            (Join-Path $HOME '.claude/agents'),
            (Join-Path $HOME '.gemini/antigravity-cli/agents')
        )) {
        if (Test-Path -LiteralPath $legacyAgentDir) {
            $legacyPaths += @(Get-ChildItem -LiteralPath $legacyAgentDir -File -Filter 'ds-*.md' | ForEach-Object { $_.FullName })
        }
    }
    $legacyPaths = @($legacyPaths | Where-Object { Test-Path -LiteralPath $_ })
} else {
    if (Test-Path -LiteralPath (Join-Path $projectPath '.claude/skills/agent-governance')) {
        $legacyPaths += (Join-Path $projectPath '.claude/skills/agent-governance')
    }
    foreach ($legacyAgentDir in @(
            (Join-Path $projectPath '.opencode/agents'),
            (Join-Path $projectPath '.claude/agents'),
            (Join-Path $projectPath '.agents/agents')
        )) {
        if (Test-Path -LiteralPath $legacyAgentDir) {
            $legacyPaths += @(Get-ChildItem -LiteralPath $legacyAgentDir -File -Filter 'ds-*.md' | ForEach-Object { $_.FullName })
        }
    }
}
if ($legacyPaths.Count -gt 0) {
    throw "Instalação antiga (agent-governance-kit) detectada; nada foi alterado. Revise e remova manualmente:`n$($legacyPaths -join "`n")"
}

if ((Test-Path -LiteralPath $skillTarget) -and -not $Upgrade) { $collisions += $skillTarget }
if ($AuditDocs -and -not $Upgrade) {
    foreach ($name in @('audit-docs.js', 'audit-docs.core.js', 'audit-docs.sources.js', 'audit-docs.config.js')) {
        $target = Join-Path $auditTarget $name
        if (Test-Path -LiteralPath $target) { $collisions += $target }
    }
}
if (-not $Global) {
    $runnersToCheck = if ($Runner -eq 'all') { @('opencode', 'claude', 'agy') } else { @($Runner.ToLowerInvariant()) }
    foreach ($r in $runnersToCheck) {
        $rDir = switch ($r) {
            'opencode' { Join-Path $projectPath '.opencode/agents' }
            'claude'   { Join-Path $projectPath '.claude/agents' }
            'agy'      { Join-Path $projectPath '.agents/agents' }
            default    { $null }
        }
        if ($rDir -and (Test-Path -LiteralPath $rDir)) {
            foreach ($agentFile in $agentFiles) {
                $target = Join-Path $rDir $agentFile.Name
                if (Test-Path -LiteralPath $target) { $collisions += $target }
            }
        }
    }
}
if ($collisions.Count -gt 0) {
    throw "Instalação interrompida; existem destinos a revisar:`n$($collisions -join "`n")"
}

if ($Upgrade -and (Test-Path -LiteralPath $skillTarget)) {
    Remove-Item -LiteralPath $skillTarget -Recurse -Force
}
New-Item -ItemType Directory -Path (Split-Path -Parent $skillTarget) -Force | Out-Null
Copy-Item -LiteralPath $skillSource -Destination $skillTarget -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Destination (Join-Path $skillTarget 'VERSION')

# Compila e instala agentes canônicos para o(s) runner(s) alvo
$transpilerScript = Join-Path $PSScriptRoot 'tools/guild-transpiler.js'
$transpilerArgs = @(
    $transpilerScript,
    '--source', $agentsSource,
    '--target', $projectPath,
    '--runner', $Runner
)
if ($Global) { $transpilerArgs += '--global' }
if ($Global -or $Upgrade) { $transpilerArgs += '--force' }
& node @transpilerArgs
if ($LASTEXITCODE -ne 0) {
    throw "Falha na compilação e instalação dos agentes para o runner: $Runner"
}

if ($AuditDocs) {
    New-Item -ItemType Directory -Path $auditTarget -Force | Out-Null
    foreach ($name in @('audit-docs.js', 'audit-docs.core.js', 'audit-docs.sources.js')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "tools/$name") -Destination (Join-Path $auditTarget $name) -Force:$Upgrade
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates/audit-docs/audit-docs.config.js') -Destination (Join-Path $auditTarget 'audit-docs.config.js') -Force:$Upgrade
}

$symlinkFailures = @()
if ($Global) {
    # Symlink, não cópia: cada CLI descobre a skill em seu próprio diretório
    # de skills e a mantém invocável nativamente, com uma única fonte real.
    # Falha de symlink (privilégio insuficiente, sem modo desenvolvedor) não
    # aborta a instalação — a skill segue utilizável via referência manual.
    $links = @(
        (Join-Path $HOME '.claude/skills/oathbound'),
        (Join-Path $HOME '.codex/skills/oathbound'),
        (Join-Path $HOME '.gemini/config/skills/oathbound')
    )
    foreach ($link in $links) {
        if (Test-Path -LiteralPath $link) { continue }
        New-Item -ItemType Directory -Path (Split-Path -Parent $link) -Force | Out-Null
        try {
            New-Item -ItemType SymbolicLink -Path $link -Target $skillTarget -ErrorAction Stop | Out-Null
        } catch {
            $symlinkFailures += "$link - $($_.Exception.Message)"
        }
    }
}

$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
if ($Global) {
    Write-Output "Oathbound $version instalado globalmente em $skillTarget"
    Write-Output "Agentes da guilda instalados/atualizados para o runner '$Runner'."
    Write-Output "Symlinks criados em ~/.claude/skills/, ~/.codex/skills/ e ~/.gemini/config/skills/ (AGY e Antigravity Gemini nativo)."
    if ($symlinkFailures.Count -gt 0) {
        Write-Output "Falha ao criar symlink (ative o Modo de desenvolvedor do Windows ou rode como administrador):"
        foreach ($f in $symlinkFailures) { Write-Output "  $f" }
    }
    Write-Output "Outras CLIs sem convenção documentada: aponte manualmente para $skillTarget/SKILL.md."
} else {
    Write-Output "Oathbound $version instalado em $projectPath (runner: $Runner)"
}
Write-Output 'Fluxo Matt Pocock (triagem, spec, tickets) incorporado aos agentes canônicos.'
Write-Output 'Inicie o oathkeeper como agente primário (OpenCode) ou por `claude --agent oathkeeper` (Claude Code).'
if ($AuditDocs) { Write-Output 'Auditor de documentação instalado; adapte tools/audit-docs.config.js antes de usar.' }
if (-not $Global) {
    $agentsMdPath = Join-Path $projectPath 'AGENTS.md'
    $agentsFragmentPath = Join-Path $PSScriptRoot 'templates/AGENTS.fragment.md'
    if (Test-Path -LiteralPath $agentsFragmentPath) {
        $fragmentContent = Get-Content -LiteralPath $agentsFragmentPath -Raw
        if (-not (Test-Path -LiteralPath $agentsMdPath)) {
            Set-Content -LiteralPath $agentsMdPath -Value $fragmentContent -NoNewline
            Write-Output "Criado AGENTS.md com o ponteiro da governança."
        } elseif (-not ((Get-Content -LiteralPath $agentsMdPath -Raw) -match 'oathbound')) {
            Write-Output "AGENTS.md já existe. Adicione o ponteiro de templates/AGENTS.fragment.md ao AGENTS.md do projeto."
        }
    }
    Write-Output 'Revise os arquivos e configure o runner/modelo (OpenCode, Claude, Codex, AGY, Generic).'
} else {
    Write-Output 'Revise os arquivos e configure o runner/modelo desejado.'
}
