# Validation script for legEv values after CSV generation

function Test-LegEvValues {
    param(
        [string]$CsvPath,
        [string]$Platform = "Unknown"
    )
    
    if (-not (Test-Path $CsvPath)) {
        Write-Error "CSV file not found: $CsvPath"
        return $false
    }
    
    $content = Get-Content $CsvPath
    $headers = $content[0].Split(',')
    $legEvIndex = [Array]::IndexOf($headers, "legEv")
    
    if ($legEvIndex -eq -1) {
        Write-Error "legEv column not found in CSV headers for $Platform"
        return $false
    }
    
    $legEvValues = @()
    for ($i = 1; $i -lt $content.Count; $i++) {
        $fields = $content[$i].Split(',')
        if ($fields.Count -gt $legEvIndex) {
            try {
                $legEv = [double]$fields[$legEvIndex]
                $legEvValues += $legEv
            } catch {
                Write-Warning "Invalid legEv value at line $($i+1): $($fields[$legEvIndex])"
            }
        }
    }
    
    if ($legEvValues.Count -eq 0) {
        Write-Error "No valid legEv values found in $Platform CSV"
        return $false
    }
    
    $avgEv = ($legEvValues | Measure-Object -Average).Average
    $maxEv = ($legEvValues | Measure-Object -Maximum).Maximum
    $positiveCount = ($legEvValues | Where-Object { $_ -gt 0.001 }).Count
    
    Write-Host "[$Platform] legEv Validation:" -ForegroundColor Cyan
    Write-Host "  Total legs: $($legEvValues.Count)"
    Write-Host "  Average legEv: $($avgEv.ToString('F6'))"
    Write-Host "  Max legEv: $($maxEv.ToString('F6'))"
    Write-Host "  Positive legs: $positiveCount/$($legEvValues.Count) ($([math]::Round($positiveCount/$legEvValues.Count*100,1))%)"
    
    # Validation checks
    $isValid = $true
    
    if ($avgEv -le 0) {
        Write-Host "  ❌ FAIL: Average legEv is zero or negative" -ForegroundColor Red
        $isValid = $false
    } else {
        Write-Host "  ✅ PASS: Average legEv is positive" -ForegroundColor Green
    }
    
    if ($positiveCount -eq 0) {
        Write-Host "  ❌ FAIL: No positive legEv values found" -ForegroundColor Red
        $isValid = $false
    } else {
        Write-Host "  ✅ PASS: Found $positiveCount positive legEv values" -ForegroundColor Green
    }
    
    if ($maxEv -lt 0.01) {
        Write-Host "  ⚠️  WARN: Max legEv is very low (< 1%)" -ForegroundColor Yellow
    }
    
    return $isValid
}

function Test-AllLegEv {
    Write-Host "=== LEG EV VALIDATION ===" -ForegroundColor Green
    Write-Host ""
    
    $ppValid = Test-LegEvValues -CsvPath "prizepicks-legs.csv" -Platform "PP"
    Write-Host ""
    $udValid = Test-LegEvValues -CsvPath "underdog-legs.csv" -Platform "UD"
    Write-Host ""
    
    if ($ppValid -and $udValid) {
        Write-Host "🎉 ALL VALIDATIONS PASSED" -ForegroundColor Green
        return $true
    } elseif ($ppValid -or $udValid) {
        Write-Host "⚠️  PARTIAL VALIDATION - Some platforms failed" -ForegroundColor Yellow
        return $false
    } else {
        Write-Host "❌ ALL VALIDATIONS FAILED" -ForegroundColor Red
        return $false
    }
}

# Run validation if called directly
if ($MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    $success = Test-AllLegEv
    exit $(if ($success) { 0 } else { 1 })
}
