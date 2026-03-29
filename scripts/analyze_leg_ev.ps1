# Header-based CSV parser for legEv analysis
# Resilient to column order changes

function Get-LegEvData {
    param(
        [string]$CsvPath,
        [string]$Platform = "PP"
    )
    
    if (-not (Test-Path $CsvPath)) {
        Write-Error "CSV file not found: $CsvPath"
        return
    }
    
    $content = Get-Content $CsvPath
    $headers = $content[0].Split(',')
    $legEvIndex = [Array]::IndexOf($headers, "legEv")
    $trueProbIndex = [Array]::IndexOf($headers, "trueProb")
    $playerIndex = [Array]::IndexOf($headers, "player")
    $statIndex = [Array]::IndexOf($headers, "stat")
    $lineIndex = [Array]::IndexOf($headers, "line")
    
    if ($legEvIndex -eq -1) {
        Write-Error "legEv column not found in CSV headers"
        return
    }
    
    $legs = @()
    for ($i = 1; $i -lt $content.Count; $i++) {
        $fields = $content[$i].Split(',')
        if ($fields.Count -gt $legEvIndex) {
            $legEv = [double]$fields[$legEvIndex]
            $trueProb = [double]$fields[$trueProbIndex]
            $player = $fields[$playerIndex]
            $stat = $fields[$statIndex]
            $line = $fields[$lineIndex]
            
            $legs += @{
                Platform = $Platform
                Player = $player
                Stat = $stat
                Line = $line
                LegEv = $legEv
                TrueProb = $trueProb
            }
        }
    }
    
    return $legs
}

function Compare-LegEv {
    $ppLegs = Get-LegEvData -CsvPath "prizepicks-legs.csv" -Platform "PP"
    $udLegs = Get-LegEvData -CsvPath "underdog-legs.csv" -Platform "UD"
    
    Write-Host "=== LEG EV ANALYSIS ===" -ForegroundColor Green
    Write-Host ""
    
    # PP Analysis
    if ($ppLegs.Count -gt 0) {
        $ppAvgEv = ($ppLegs | ForEach-Object { $_.LegEv } | Measure-Object -Average).Average
        $ppMaxEv = ($ppLegs | ForEach-Object { $_.LegEv } | Measure-Object -Maximum).Maximum
        $ppPositiveCount = ($ppLegs | Where-Object { $_.LegEv -gt 0 }).Count
        
        Write-Host "PRIZEPICKS ($($ppLegs.Count) legs):" -ForegroundColor Cyan
        Write-Host "  Average legEv: $($ppAvgEv.ToString('F4'))"
        Write-Host "  Max legEv: $($ppMaxEv.ToString('F4'))"
        Write-Host "  Positive legEv: $ppPositiveCount/$($ppLegs.Count) ($([math]::Round($ppPositiveCount/$ppLegs.Count*100,1))%)"
        Write-Host ""
        Write-Host "Top 5 PP legs by legEv:" -ForegroundColor Yellow
        $ppLegs | Sort-Object -Property LegEv -Descending | Select-Object -First 5 | ForEach-Object {
            Write-Host "  $($_.Player) $($_.Stat) $($_.Line): legEv=$($_.LegEv.ToString('F4'))"
        }
    } else {
        Write-Host "PRIZEPICKS: No legs found" -ForegroundColor Red
    }
    
    Write-Host ""
    
    # UD Analysis
    if ($udLegs.Count -gt 0) {
        $udAvgEv = ($udLegs | ForEach-Object { $_.LegEv } | Measure-Object -Average).Average
        $udMaxEv = ($udLegs | ForEach-Object { $_.LegEv } | Measure-Object -Maximum).Maximum
        $udPositiveCount = ($udLegs | Where-Object { $_.LegEv -gt 0 }).Count
        
        Write-Host "UNDERDOG ($($udLegs.Count) legs):" -ForegroundColor Cyan
        Write-Host "  Average legEv: $($udAvgEv.ToString('F4'))"
        Write-Host "  Max legEv: $($udMaxEv.ToString('F4'))"
        Write-Host "  Positive legEv: $udPositiveCount/$($udLegs.Count) ($([math]::Round($udPositiveCount/$udLegs.Count*100,1))%)"
        Write-Host ""
        Write-Host "Top 5 UD legs by legEv:" -ForegroundColor Yellow
        $udLegs | Sort-Object -Property LegEv -Descending | Select-Object -First 5 | ForEach-Object {
            Write-Host "  $($_.Player) $($_.Stat) $($_.Line): legEv=$($_.LegEv.ToString('F4'))"
        }
    } else {
        Write-Host "UNDERDOG: No legs found" -ForegroundColor Red
    }
    
    Write-Host ""
    
    # Validation
    $totalLegs = $ppLegs.Count + $udLegs.Count
    $allPositiveCount = ($ppLegs + $udLegs | Where-Object { $_.LegEv -gt 0 }).Count
    
    if ($totalLegs -gt 0 -and $allPositiveCount -eq 0) {
        Write-Host "⚠️  VALIDATION WARNING: All legEv values are zero!" -ForegroundColor Red
        Write-Host "   This indicates a potential column index issue or assignment problem." -ForegroundColor Red
    } elseif ($totalLegs -gt 0) {
        Write-Host "✅ VALIDATION PASSED: $($allPositiveCount)/$totalLegs legs have positive legEv" -ForegroundColor Green
    }
}

# Run comparison if called directly
if ($MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    Compare-LegEv
}
