# deploy.ps1 — Build + stage production files for IONOS /dfs/
# Output: ionos-deploy.zip containing ONLY the listed production files.
# Usage: .\deploy.ps1  or  npm run deploy

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$stage = Join-Path $root "ionos-stage"

Write-Host "`n=== DFS IONOS DEPLOY ===" -ForegroundColor Cyan

# 1) Build web dashboard only (dist/ = built dashboard assets)
Write-Host "[1/3] Building dashboard (dist/)..." -ForegroundColor Yellow
Push-Location (Join-Path $root "web-dashboard")
npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "  web-dashboard/dist/ built"

# 2) Stage ONLY allowed production files
Write-Host "[2/3] Staging production files..." -ForegroundColor Yellow
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item $stage -ItemType Directory | Out-Null

# Explicit list per requirement
$rootFiles = @(
    "cron-generate.py",
    "sheets_push_legs.py", "sheets_push_cards.py",
    "sheets_push_underdog_legs.py", "sheets_push_underdog_cards.py",
    ".htaccess", ".htpasswd",
    "package.json",
    "credentials.json", "token.json"
)
foreach ($f in $rootFiles) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $stage $f) }
}

# Dashboard at dfs root (no dist/) so URL is /dfs/ not /dfs/dist/
$dashDist = Join-Path $root "web-dashboard\dist"
if (Test-Path $dashDist) {
    Copy-Item "$dashDist\*" $stage -Recurse
}

# artifacts/merge_audit_report.md (optional)
New-Item (Join-Path $stage "artifacts") -ItemType Directory -Force | Out-Null
$auditReport = Join-Path $root "artifacts\merge_audit_report.md"
if (Test-Path $auditReport) {
    Copy-Item $auditReport (Join-Path $stage "artifacts\merge_audit_report.md")
}

# 3) Create ZIP
Write-Host "[3/3] Creating ionos-deploy.zip..." -ForegroundColor Yellow
$zipPath = Join-Path $root "ionos-deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zipPath -Force
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "  ionos-deploy.zip ($zipSize KB)"

# Manifest
Write-Host "`n--- ZIP CONTENTS ---" -ForegroundColor Yellow
Get-ChildItem $stage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Replace("$stage\", "").Replace("\", "/")
    Write-Host "  $rel"
}
$fileCount = (Get-ChildItem $stage -Recurse -File).Count
Write-Host "`n  Total: $fileCount files" -ForegroundColor Green
Remove-Item $stage -Recurse -Force

Write-Host "`n=== UPLOAD ===" -ForegroundColor Cyan
Write-Host "Upload ionos-deploy.zip to IONOS, then: cd /dfs && unzip -o ionos-deploy.zip && rm ionos-deploy.zip"
Write-Host ""