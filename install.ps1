# Copia a versão atual para um repositório Git, ou globalmente para o perfil
# do usuário, sem sobrescrever arquivos de projeto (o modo -Global sobrescreve
# agentes ds-* por design — ver README).
[CmdletBinding(DefaultParameterSetName = 'Project')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Project')]
    [string]$Project,
    [Parameter(Mandatory = $true, ParameterSetName = 'Global')]
    [switch]$Global,
    [switch]$MattPocock,
    [switch]$AuditDocs
)

$ErrorActionPreference = 'Stop'

if ($Global) {
    # Fonte única e agnóstica de CLI em ~/.agent-governance-kit/. Cada CLI com
    # diretório de skills conhecido (Claude Code, Codex) recebe um symlink
    # apontando pra essa fonte — não uma cópia — para que a skill fique
    # invocável (/agent-governance, $agent-governance) nativamente em cada
    # host, sem duplicar arquivos nem arriscar drift entre cópias.
    $projectPath = $HOME
    $skillTarget = Join-Path $HOME '.agent-governance-kit'
    $agentsTarget = Join-Path $HOME '.config/opencode/agents'
    $auditTarget = Join-Path $HOME '.agent-governance-kit/tools'
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
    $skillTarget = Join-Path $projectPath '.claude/skills/agent-governance'
    $agentsTarget = Join-Path $projectPath '.opencode/agents'
    $auditTarget = Join-Path $projectPath 'tools'
}

$skillSource = Join-Path $PSScriptRoot 'skill'
$agentsSource = Join-Path $PSScriptRoot 'adapters/opencode/agents'
$mattSource = Join-Path $PSScriptRoot 'optional/matt-pocock'
$agentFiles = @(Get-ChildItem -LiteralPath $agentsSource -File -Filter '*.md')
$collisions = @()
if (Test-Path -LiteralPath $skillTarget) { $collisions += $skillTarget }
if ($AuditDocs) {
    foreach ($name in @('audit-docs.js', 'audit-docs.core.js', 'audit-docs.sources.js', 'audit-docs.config.js')) {
        $target = Join-Path $auditTarget $name
        if (Test-Path -LiteralPath $target) { $collisions += $target }
    }
}
if (-not $Global) {
    # -Global sobrescreve deliberadamente os agentes ds-* já instalados (README);
    # agentes fora deste conjunto (ex.: ds-worker) não são tocados nem recusados.
    foreach ($agentFile in $agentFiles) {
        $target = Join-Path $agentsTarget $agentFile.Name
        if (Test-Path -LiteralPath $target) { $collisions += $target }
    }
}
if ($collisions.Count -gt 0) {
    throw "Instalação interrompida; existem destinos a revisar:`n$($collisions -join "`n")"
}

New-Item -ItemType Directory -Path (Split-Path -Parent $skillTarget), $agentsTarget -Force | Out-Null
Copy-Item -LiteralPath $skillSource -Destination $skillTarget -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Destination (Join-Path $skillTarget 'VERSION')
foreach ($agentFile in $agentFiles) {
    $source = $agentFile.FullName
    if ($MattPocock) {
        $candidate = Join-Path $mattSource "agents/$($agentFile.Name)"
        if (Test-Path -LiteralPath $candidate) { $source = $candidate }
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $agentsTarget $agentFile.Name) -Force:$Global
}
if ($AuditDocs) {
    New-Item -ItemType Directory -Path $auditTarget -Force | Out-Null
    foreach ($name in @('audit-docs.js', 'audit-docs.core.js', 'audit-docs.sources.js')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "tools/$name") -Destination (Join-Path $auditTarget $name)
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'templates/audit-docs/audit-docs.config.js') -Destination (Join-Path $auditTarget 'audit-docs.config.js')
}

$symlinkFailures = @()
if ($Global) {
    # Symlink, não cópia: cada CLI descobre a skill em seu próprio diretório
    # de skills e a mantém invocável nativamente, com uma única fonte real.
    # Falha de symlink (privilégio insuficiente, sem modo desenvolvedor) não
    # aborta a instalação — a skill segue utilizável via referência manual.
    $links = @(
        (Join-Path $HOME '.claude/skills/agent-governance'),
        (Join-Path $HOME '.codex/skills/agent-governance')
    )
    foreach ($link in $links) {
        if (Test-Path -LiteralPath $link) { continue }
        New-Item -ItemType Directory -Path (Split-Path -Parent $link) -Force | Out-Null
        try {
            New-Item -ItemType SymbolicLink -Path $link -Target $skillTarget -ErrorAction Stop | Out-Null
        } catch {
            $symlinkFailures += "$link — $($_.Exception.Message)"
        }
    }
}

$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
if ($Global) {
    Write-Output "Agent Governance Kit $version instalado globalmente em $skillTarget"
    Write-Output "Agentes ds-* sobrescritos em $agentsTarget (versão do repositório)."
    Write-Output "Symlinks criados em ~/.claude/skills/agent-governance e ~/.codex/skills/agent-governance."
    if ($symlinkFailures.Count -gt 0) {
        Write-Output "Falha ao criar symlink (ative o Modo de desenvolvedor do Windows ou rode como administrador):"
        foreach ($f in $symlinkFailures) { Write-Output "  $f" }
    }
    Write-Output "AGY e outras CLIs sem convenção documentada: aponte manualmente para $skillTarget/SKILL.md."
} else {
    Write-Output "Agent Governance Kit $version instalado em $projectPath"
}
if ($MattPocock) { Write-Output 'Fluxo opcional Matt Pocock instalado.' }
if ($AuditDocs) { Write-Output 'Auditor de documentação instalado; adapte tools/audit-docs.config.js antes de usar.' }
if (-not $Global) {
    Write-Output 'Revise os arquivos, configure o modelo OpenCode e adicione o ponteiro ao AGENTS.md do projeto.'
} else {
    Write-Output 'Revise os arquivos e configure o modelo OpenCode.'
}
