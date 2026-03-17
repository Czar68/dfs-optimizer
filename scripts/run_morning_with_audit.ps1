# Run pipeline with merge report, then audit merge_report.csv and write merge_audit_report.md
# Usage: .\scripts\run_morning_with_audit.ps1 [-Sport NBA|NCAAB|All]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("NBA", "NCAAB", "All")]
    [string]$Sport = "NBA"
)

$ScriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ScriptDir

$env:EXPORT_MERGE_REPORT = "1"
& (Join-Path $ScriptDir "run-nba.ps1") -Sport $Sport
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Pipeline exited with $LASTEXITCODE; audit may still run on existing merge_report.csv"
}

npm run audit-merge
if (Test-Path Env:EXPORT_MERGE_REPORT) { Remove-Item Env:EXPORT_MERGE_REPORT -ErrorAction SilentlyContinue }
Write-Host "Open merge_audit_report.md to review suggested aliases and apply in src/merge_odds.ts"
