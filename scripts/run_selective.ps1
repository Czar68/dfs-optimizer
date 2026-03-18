# Run master_auto for all projects EXCEPT the one given (or current project when run from repo).
# Usage: .\scripts\run_selective.ps1 -Mode full -Force
#        .\scripts\run_selective.ps1 -Mode full -Force -ExcludeProject dfs-optimizer
param(
    [ValidateSet("dry", "agent", "full", "status")]
    [string]$Mode = "status",
    [switch]$Force,
    [string]$ExcludeProject = ""
)

$MasterAutoRoot = "C:\\Dev\\Projects\\master_auto"
$RegistryPath = Join-Path $MasterAutoRoot "projects.json"
$AutoModeScript = Join-Path $MasterAutoRoot "scripts\auto_mode.ps1"
$MasterStatusScript = Join-Path $MasterAutoRoot "scripts\master_status.ps1"

# Resolve exclude: -ExcludeProject or current directory project name
$currentPath = (Get-Location).Path.TrimEnd('\')
if (-not $ExcludeProject -and (Test-Path $RegistryPath)) {
    $registry = Get-Content $RegistryPath -Raw -Encoding utf8 | ConvertFrom-Json
    foreach ($p in $registry.projects) {
        $projectPath = $p.path.Replace('\\', '\')
        if ($currentPath -eq $projectPath -or $currentPath -like "$projectPath\*") {
            $ExcludeProject = $p.name
            break
        }
    }
}

$allNames = @("dfs-optimizer", "sportsbook-optimizer", "ebay-scanner", "disc-only-scanner", "new-projects")
if (Test-Path $RegistryPath) {
    $registry = Get-Content $RegistryPath -Raw -Encoding utf8 | ConvertFrom-Json
    $allNames = @($registry.projects | ForEach-Object { $_.name })
}
$Subset = @($allNames | Where-Object { $_ -ne $ExcludeProject })

if ($Mode -eq "dry") {
    Write-Host "Would run master_auto excluding: $ExcludeProject"
    Write-Host "Subset: $($Subset -join ', ')"
    exit 0
}

if ($Mode -eq "status") {
    & $MasterStatusScript -Force
    exit $LASTEXITCODE
}

$autoMode = if ($Mode -eq "full") { "all" } else { "nightly" }
& $AutoModeScript -Mode $autoMode -Subset $Subset -Force:$Force
exit $LASTEXITCODE
