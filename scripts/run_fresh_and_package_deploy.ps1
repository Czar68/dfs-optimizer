# run_fresh_and_package_deploy.ps1 — Fresh data + build + package deploy bundle
# Produces artifacts/deploy_bundle/ ready for upload to IONOS

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# 1) Run fresh + build + manifest
Write-Host "`n=== STEP 1: Fresh + Build ===" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "run_fresh_and_build.ps1")
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL: run_fresh_and_build.ps1 exited $LASTEXITCODE" -ForegroundColor Red
  exit $LASTEXITCODE
}

# 2) Package deploy bundle
Write-Host "`n=== STEP 2: Package deploy bundle ===" -ForegroundColor Cyan
$distSrc = Join-Path $root "web-dashboard\dist"
$bundleDir = Join-Path $root "artifacts\deploy_bundle"

if (Test-Path $bundleDir) { Remove-Item $bundleDir -Recurse -Force }
New-Item $bundleDir -ItemType Directory -Force | Out-Null

Copy-Item (Join-Path $distSrc "*") $bundleDir -Recurse -Force
Write-Host "  Copied dist/ -> artifacts/deploy_bundle/"

$files = Get-ChildItem $bundleDir -Recurse -File
Write-Host "  Bundle contents ($($files.Count) files):"
foreach ($f in $files) {
  $rel = $f.FullName.Replace($bundleDir, "").TrimStart("\")
  Write-Host "    $rel ($($f.Length) bytes)"
}

# 3) Create zip for easy upload
$zipPath = Join-Path $root "artifacts\deploy_bundle.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath
Write-Host "`n  ZIP: $zipPath ($($(Get-Item $zipPath).Length) bytes)" -ForegroundColor Green

Write-Host "`nDONE — deploy bundle ready at artifacts/deploy_bundle/" -ForegroundColor Green
Write-Host "Upload contents of artifacts/deploy_bundle/ to IONOS document root." -ForegroundColor Yellow
exit 0
