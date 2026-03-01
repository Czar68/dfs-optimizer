# Idempotent: Cursor CLI (cursor-agent) for headless nightly_maint.ps1 across all 4 projects.
# Run from any project or master_auto: .\scripts\install_cli.ps1
# .env must have CURSOR_API_KEY= (from cursor.com/settings)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$cliPath = Join-Path $env:USERPROFILE ".cursor\bin\cursor-agent.exe"
$cliDir = Split-Path $cliPath
$zipUrl = "https://cursor.com/cli/windows-amd64.zip"
$zip = Join-Path $env:TEMP "cursor-cli.zip"
$projectRoot = Split-Path $PSScriptRoot -Parent
$artifactsDir = Join-Path $projectRoot "artifacts"

if (-not (Test-Path $cliDir)) { New-Item -ItemType Directory -Path $cliDir -Force | Out-Null }

if (-not (Test-Path $cliPath)) {
    try {
        Write-Output "Downloading Cursor CLI..."
        Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing -TimeoutSec 15
        $bytes = [System.IO.File]::ReadAllBytes($zip)
        $isZip = ($bytes.Length -ge 4) -and ($bytes[0] -eq 0x50) -and ($bytes[1] -eq 0x4B)
        if ($isZip) {
            $extractDir = Join-Path $env:TEMP "cursor-cli-extract"
            if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
            Expand-Archive -Path $zip -DestinationPath $extractDir -Force
            $exe = Get-ChildItem -Path $extractDir -Recurse -Filter "cursor-agent.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $exe) { $exe = Get-ChildItem -Path $extractDir -Recurse -Filter "agent.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 }
            if (-not $exe) { $exe = Get-ChildItem -Path $extractDir -Recurse -Include "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 }
            if ($exe) {
                Copy-Item -Path $exe.FullName -Destination $cliPath -Force
                $agentPath = Join-Path $cliDir "agent.exe"
                if (-not (Test-Path $agentPath)) { Copy-Item -Path $cliPath -Destination $agentPath -Force }
            }
        }
    } catch { Write-Warning "Download failed; use manual one-time install (see Quick Manual Test in README)." }
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
}

# Add to PATH (current session + permanent User)
$env:PATH = $env:PATH.TrimEnd(';') + ";$cliDir"
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$cliDir*") {
    [Environment]::SetEnvironmentVariable("PATH", $userPath.TrimEnd(';') + ";$cliDir", "User")
    Write-Output "Added to User PATH: $cliDir (restart PS for new sessions)."
}

# Test: write version to project (or master_auto) artifacts
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
$versionFile = Join-Path $artifactsDir "cli_version.txt"
if (Test-Path $cliPath) {
    & $cliPath --version 2>&1 | Out-File $versionFile -Encoding utf8
} else {
    "not installed" | Out-File $versionFile -Encoding utf8
}
$ver = (Get-Content $versionFile -Raw -ErrorAction SilentlyContinue) -replace "[\r\n]+", " "
Write-Output "CLI v$($ver.Trim()) LIVE across 4 projects"
