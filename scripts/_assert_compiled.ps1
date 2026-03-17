# Pre-flight: ensure required dist/ artifacts exist. Dot-source from scripts that run compiled JS.
# Usage: Assert-Compiled -Root $root -RequiredArtifacts @('dist\src\run_optimizer.js', ...)
# Root must be absolute (e.g. [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))).

function Assert-Compiled {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string[]]$RequiredArtifacts
    )
    $absRoot = [System.IO.Path]::GetFullPath($Root)
    foreach ($rel in $RequiredArtifacts) {
        $absPath = [System.IO.Path]::GetFullPath((Join-Path $absRoot $rel))
        if (-not (Test-Path -LiteralPath $absPath)) {
            Write-Error "Missing artifact: $absPath. Please run npm run build."
            exit 1
        }
    }
}
