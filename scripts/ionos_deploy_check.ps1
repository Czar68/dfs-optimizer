# IONOS deploy guard: Vite build + verify index.html, .htaccess, assets (no 404).
# Run before push. Usage: .\scripts\ionos_deploy_check.ps1 or npm run deploy:check
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1) Run npm run build (if present)
if ((Get-Content "package.json" -Raw -ErrorAction SilentlyContinue) -match '"build"') {
    Write-Host "Running npm run build..."
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm run build failed. Fix build before deploy."
        exit 1
    }
} elseif (Test-Path "web-dashboard\package.json") {
    Push-Location "web-dashboard"
    if ((Get-Content "package.json" -Raw) -match '"build"') {
        Write-Host "Running npm run build in web-dashboard..."
        npm run build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Error "web-dashboard build failed."
            exit 1
        }
    }
    Pop-Location
}

# 2) Find dist folder (root dist or web-dashboard/dist)
$distRoot = $null
if (Test-Path "dist\index.html") { $distRoot = "dist" }
elseif (Test-Path "web-dashboard\dist\index.html") { $distRoot = "web-dashboard\dist" }
elseif (Test-Path "dist") { $distRoot = "dist" }
elseif (Test-Path "web-dashboard\dist") { $distRoot = "web-dashboard\dist" }

if (-not $distRoot) {
    Write-Error "No dist folder with index.html found. Run npm run build (in root or web-dashboard)."
    exit 1
}
Write-Host "Using dist root: $distRoot"

# 3) Verify index.html exists
$indexPath = Join-Path $distRoot "index.html"
if (-not (Test-Path $indexPath)) {
    Write-Error "Missing $indexPath"
    exit 1
}
Write-Host "OK: index.html"

# 4) .htaccess (optional; often in dist or root for SPA rewrite)
$htaccess = Join-Path $distRoot ".htaccess"
if (-not (Test-Path $htaccess)) {
    $htaccess = Join-Path $root ".htaccess"
}
if (Test-Path $htaccess) {
    Write-Host "OK: .htaccess found"
} else {
    Write-Host "WARN: .htaccess not found (IONOS SPA rewrite may need it)"
}

# 5) Assets no 404: parse index.html for src/href, check files exist under distRoot
$indexContent = Get-Content $indexPath -Raw -Encoding utf8
$assetRefs = [regex]::Matches($indexContent, '(?:src|href)="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$missing = @()
foreach ($ref in $assetRefs) {
    $ref = $ref.TrimStart('/')
    if ($ref -match '^(https?:|data:|#)') { continue }
    $fullPath = Join-Path $distRoot $ref
    if (-not (Test-Path $fullPath)) {
        $missing += $ref
    }
}
if ($missing.Count -gt 0) {
    Write-Error "Assets missing (would 404): $($missing -join ', ')"
    exit 1
}
Write-Host "OK: referenced assets exist (no 404 guard passed)"
Write-Host "IONOS deploy check passed."
exit 0
