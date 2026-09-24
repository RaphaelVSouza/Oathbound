# Copia a versão atual para um repositório Git sem sobrescrever arquivos.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Project,
    [switch]$MattPocock
)

$ErrorActionPreference = 'Stop'
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

$skillSource = Join-Path $PSScriptRoot 'skill'
$agentsSource = Join-Path $PSScriptRoot 'adapters/opencode/agents'
$mattSource = Join-Path $PSScriptRoot 'optional/matt-pocock'
$skillTarget = Join-Path $projectPath '.claude/skills/agent-governance'
$agentsTarget = Join-Path $projectPath '.opencode/agents'
$agentFiles = @(Get-ChildItem -LiteralPath $agentsSource -File -Filter '*.md')
$collisions = @()
if (Test-Path -LiteralPath $skillTarget) { $collisions += $skillTarget }
foreach ($agentFile in $agentFiles) {
    $target = Join-Path $agentsTarget $agentFile.Name
    if (Test-Path -LiteralPath $target) { $collisions += $target }
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
    Copy-Item -LiteralPath $source -Destination (Join-Path $agentsTarget $agentFile.Name)
}

$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'VERSION') -Raw).Trim()
Write-Output "Agent Governance Kit $version instalado em $projectPath"
if ($MattPocock) { Write-Output 'Fluxo opcional Matt Pocock instalado.' }
Write-Output 'Revise os arquivos, configure o modelo OpenCode e adicione o ponteiro ao AGENTS.md do projeto.'
