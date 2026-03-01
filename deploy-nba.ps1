# deploy-nba.ps1
# One-click Netlify deploy: build → git push → auto-live (netlify.toml)
# Usage: .\deploy-nba.ps1 [-SkipBuild] [-Commit]

param(
    [Parameter(Mandatory=$false)]
    [switch]$SkipBuild = $false,

    [Parameter(Mandatory=$false)]
    [switch]$Commit = $false
)

function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Info "=========================================="
Write-Info "NBA Dashboard - Netlify Deploy (Git push)"
Write-Info "=========================================="

# Step 1: Build if not skipped (optional; Netlify builds from source)
if (-not $SkipBuild) {
    Write-Info "[1/3] Building dashboard locally..."
    Push-Location web-dashboard
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed"
        }
        Write-Success "✅ Dashboard built"
    } catch {
        Write-Error "❌ Build failed: $_"
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Info "[1/3] Skipping build (--SkipBuild); Netlify will build on push"
}

# Step 2: Commit changes if requested
if ($Commit) {
    Write-Info "[2/3] Staging and committing..."
    git add -A
    $status = git status --porcelain
    if ($status) {
        git commit -m "deploy: NBA dashboard $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        Write-Success "✅ Changes committed"
    } else {
        Write-Info "   No changes to commit"
    }
} else {
    Write-Info "[2/3] Skipping commit (use -Commit to add/commit before push)"
}

# Step 3: Push → Netlify auto-deploy (netlify.toml)
Write-Info "[3/3] Pushing to origin (Netlify auto-deploy)..."
try {
    git push
    if ($LASTEXITCODE -ne 0) {
        throw "git push failed"
    }
    Write-Success "✅ Pushed. Netlify will build and go live (no password)."
} catch {
    Write-Error "❌ Push failed: $_"
    Write-Info "   Fix remote/credentials, then run again."
    exit 1
}

# Verification
$deployUrl = "https://dynamic-gingersnap-3ee837.netlify.app"
Write-Info ""
Write-Info "Deploy URL: $deployUrl"
Write-Info "Build takes ~1–2 min. Then verify:"
Write-Info "  curl -sI $deployUrl  (expect 200)"
Write-Info "  Or open in browser (Feb 19 NBA slate)."
Write-Info ""
Write-Info "Repo link: Site configuration → Build & deploy → Repository: Czar68/nba-props-dashboard, branch: main"
Write-Info "Password: Site settings → Access & security → Password Protection → OFF"
Write-Success "Done."
