# Manual research trigger — run from project root
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$artifactsDir = Join-Path $projectRoot "artifacts"
$researchLog = Join-Path $artifactsDir "research_log.md"
$improvementsDir = Join-Path $projectRoot "docs\improvements"

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
New-Item -ItemType Directory -Force -Path $improvementsDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$line = "Research run at $timestamp. Follow docs/prompts/research_rules.md and docs/prompts/nightly_improvement.md RESEARCH PHASE."
Add-Content -LiteralPath $researchLog -Value $line

Write-Host "Research trigger: $projectRoot"
Write-Host "  research_log: $researchLog"
Write-Host "  improvements: $improvementsDir"
Write-Host "  Next: Run RESEARCH PHASE from nightly_improvement.md (30min max)."
exit 0
