# Centralized path constants for scripts (mirrors src/constants/paths.ts).
# Dot-source this file: . "$PSScriptRoot\_paths.ps1"
# Use with Join-Path $root $OutputDir $FileName or Join-Path $root $ArtifactsDir "last_run.json"

$OutputDir    = "data\output_logs"
$ArtifactsDir = "artifacts"
$DataDir      = "data"

# Filenames under output dir (for Test-Path / Get-Content)
$FileNamePpLegsCsv   = "prizepicks-legs.csv"
$FileNameUdLegsCsv   = "underdog-legs.csv"
$FileNameUdCardsCsv  = "underdog-cards.csv"
$FileNameTier1Csv    = "tier1.csv"
$FileNameTier2Csv    = "tier2.csv"
$FileNameLastRunJson = "last_run.json"

# Full paths relative to $root (after Set-Location $root or $root = ...)
function Get-OutputPath { param([string]$root, [string]$name) Join-Path $root (Join-Path $OutputDir $name) }
function Get-ArtifactsPath { param([string]$root, [string]$name) Join-Path $root (Join-Path $ArtifactsDir $name) }
