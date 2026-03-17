# AI pipeline entry point. Pre-flight ensures required dist/ artifacts exist before running.
# Add your AI pipeline steps below after Assert-Compiled.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location $root
. "$PSScriptRoot\_assert_compiled.ps1"
Assert-Compiled -Root $root -RequiredArtifacts @('dist\src\run_optimizer.js')

# Add AI pipeline steps here (e.g. node dist\src\... or other automation).
Write-Host "AI pipeline pre-flight OK. Add your pipeline steps in scripts\run_ai_pipeline.ps1."
