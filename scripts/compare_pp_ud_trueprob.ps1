# Compare trueProb values between PP and UD legs for matching props

function Get-LegData {
    param(
        [string]$CsvPath,
        [string]$Platform
    )
    
    if (-not (Test-Path $CsvPath)) {
        Write-Error "CSV file not found: $CsvPath"
        return @()
    }
    
    $content = Get-Content $CsvPath
    $headers = $content[0].Split(',')
    
    # Find column indices
    $playerIndex = [Array]::IndexOf($headers, "player")
    $statIndex = [Array]::IndexOf($headers, "stat")
    $lineIndex = [Array]::IndexOf($headers, "line")
    $trueProbIndex = [Array]::IndexOf($headers, "trueProb")
    $legEvIndex = [Array]::IndexOf($headers, "legEv")
    $overOddsIndex = [Array]::IndexOf($headers, "overOdds")
    $underOddsIndex = [Array]::IndexOf($headers, "underOdds")
    $bookIndex = [Array]::IndexOf($headers, "book")
    
    if ($trueProbIndex -eq -1) {
        Write-Error "trueProb column not found in $Platform CSV"
        return @()
    }
    
    $legs = @()
    for ($i = 1; $i -lt $content.Count; $i++) {
        $fields = $content[$i].Split(',')
        if ($fields.Count -gt $trueProbIndex) {
            try {
                $player = $fields[$playerIndex]
                $stat = $fields[$statIndex]
                $line = $fields[$lineIndex]
                $trueProb = [double]$fields[$trueProbIndex]
                $legEv = [double]$fields[$legEvIndex]
                $overOdds = if ($fields[$overOddsIndex]) { $fields[$overOddsIndex] } else { "" }
                $underOdds = if ($fields[$underOddsIndex]) { $fields[$underOddsIndex] } else { "" }
                $book = if ($fields[$bookIndex]) { $fields[$bookIndex] } else { "" }
                
                # Create unique key for matching
                $key = "$player-$stat-$line"
                
                $legs += @{
                    Platform = $Platform
                    Player = $player
                    Stat = $stat
                    Line = $line
                    TrueProb = $trueProb
                    LegEv = $legEv
                    OverOdds = $overOdds
                    UnderOdds = $underOdds
                    Book = $book
                    Key = $key
                }
            } catch {
                Write-Warning "Invalid data at line $($i+1) in $Platform CSV: $($_.Exception.Message)"
            }
        }
    }
    
    return $legs
}

function Compare-TrueProb {
    Write-Host "=== TRUEPROB COMPARISON ANALYSIS ===" -ForegroundColor Green
    Write-Host ""
    
    # Get data from both platforms
    $ppLegs = Get-LegData -CsvPath "prizepicks-legs.csv" -Platform "PP"
    $udLegs = Get-LegData -CsvPath "underdog-legs.csv" -Platform "UD"
    
    Write-Host "PP legs: $($ppLegs.Count)" -ForegroundColor Cyan
    Write-Host "UD legs: $($udLegs.Count)" -ForegroundColor Cyan
    Write-Host ""
    
    # Create lookup dictionaries
    $ppLookup = @{}
    foreach ($leg in $ppLegs) {
        $ppLookup[$leg.Key] = $leg
    }
    
    $udLookup = @{}
    foreach ($leg in $udLegs) {
        $udLookup[$leg.Key] = $leg
    }
    
    # Find matches
    $matches = @()
    $ppOnly = @()
    $udOnly = @()
    
    # Check PP legs against UD
    foreach ($ppLeg in $ppLegs) {
        if ($udLookup.ContainsKey($ppLeg.Key)) {
            $matches += @{
                Key = $ppLeg.Key
                PP = $ppLeg
                UD = $udLookup[$ppLeg.Key]
            }
        } else {
            $ppOnly += $ppLeg
        }
    }
    
    # Find UD-only legs
    foreach ($udLeg in $udLegs) {
        if (-not $ppLookup.ContainsKey($udLeg.Key)) {
            $udOnly += $udLeg
        }
    }
    
    Write-Host "MATCHING PROPS: $($matches.Count)" -ForegroundColor Yellow
    Write-Host "PP-only props: $($ppOnly.Count)" -ForegroundColor Cyan
    Write-Host "UD-only props: $($udOnly.Count)" -ForegroundColor Cyan
    Write-Host ""
    
    # Analyze matches for trueProb differences
    $exactMatches = @()
    $closeMatches = @()
    $significantDifferences = @()
    
    foreach ($match in $matches) {
        $diff = [Math]::Abs($match.PP.TrueProb - $match.UD.TrueProb)
        
        if ($diff -lt 0.0001) {
            $exactMatches += $match
        } elseif ($diff -lt 0.001) {
            $closeMatches += $match
        } else {
            $significantDifferences += $match
        }
    }
    
    Write-Host "TRUEPROB ANALYSIS:" -ForegroundColor Yellow
    Write-Host "  Exact matches (diff < 0.0001): $($exactMatches.Count)" -ForegroundColor Green
    Write-Host "  Close matches (diff < 0.001): $($closeMatches.Count)" -ForegroundColor Yellow
    Write-Host "  Significant differences (diff >= 0.001): $($significantDifferences.Count)" -ForegroundColor Red
    Write-Host ""
    
    # Show significant differences
    if ($significantDifferences.Count -gt 0) {
        Write-Host "⚠️  SIGNIFICANT TRUEPROB DIFFERENCES FOUND:" -ForegroundColor Red
        Write-Host ""
        
        foreach ($diff in $significantDifferences | Sort-Object { [Math]::Abs($_.PP.TrueProb - $_.UD.TrueProb) } -Descending | Select-Object -First 10) {
            $probDiff = [Math]::Abs($diff.PP.TrueProb - $diff.UD.TrueProb)
            Write-Host "$($diff.Key):" -ForegroundColor White
            Write-Host "  PP: trueProb=$($diff.PP.TrueProb.ToString('F6')), legEv=$($diff.PP.LegEv.ToString('F6')), book=$($diff.PP.Book)"
            Write-Host "  UD: trueProb=$($diff.UD.TrueProb.ToString('F6')), legEv=$($diff.UD.LegEv.ToString('F6')), book=$($diff.UD.Book)"
            Write-Host "  Diff: $($probDiff.ToString('F6')) ($($probDiff.ToString('P2')))" -ForegroundColor Red
            Write-Host ""
        }
    }
    
    # Show exact matches sample
    if ($exactMatches.Count -gt 0) {
        Write-Host "✅ EXACT MATCHES SAMPLE (first 5):" -ForegroundColor Green
        Write-Host ""
        
        foreach ($match in $exactMatches | Select-Object -First 5) {
            Write-Host "$($match.Key):" -ForegroundColor White
            Write-Host "  PP: trueProb=$($match.PP.TrueProb.ToString('F6')), legEv=$($match.PP.LegEv.ToString('F6'))"
            Write-Host "  UD: trueProb=$($match.UD.TrueProb.ToString('F6')), legEv=$($match.UD.LegEv.ToString('F6'))"
            Write-Host ""
        }
    }
    
    # Verify legEv calculations
    Write-Host "LEG EV CALCULATION VERIFICATION:" -ForegroundColor Yellow
    Write-Host ""
    
    $ppFormulaCorrect = 0
    $udFormulaCorrect = 0
    
    foreach ($match in $matches) {
        # PP: legEv = trueProb - 0.50
        $ppExpected = $match.PP.TrueProb - 0.50
        $ppActual = $match.PP.LegEv
        if ([Math]::Abs($ppExpected - $ppActual) -lt 0.0001) {
            $ppFormulaCorrect++
        }
        
        # UD: legEv = trueProb - 0.5345
        $udExpected = $match.UD.TrueProb - 0.5345
        $udActual = $match.UD.LegEv
        if ([Math]::Abs($udExpected - $udActual) -lt 0.0001) {
            $udFormulaCorrect++
        }
    }
    
    Write-Host "PP legEv formula correct: $ppFormulaCorrect/$($matches.Count) ($([math]::Round($ppFormulaCorrect/$matches.Count*100,1))%)" -ForegroundColor $(if ($ppFormulaCorrect -eq $matches.Count) { 'Green' } else { 'Red' })
    Write-Host "UD legEv formula correct: $udFormulaCorrect/$($matches.Count) ($([math]::Round($udFormulaCorrect/$matches.Count*100,1))%)" -ForegroundColor $(if ($udFormulaCorrect -eq $matches.Count) { 'Green' } else { 'Red' })
    Write-Host ""
    
    # Final assessment
    if ($significantDifferences.Count -eq 0) {
        Write-Host "🎉 CONCLUSION: trueProb values are consistent across platforms!" -ForegroundColor Green
        Write-Host "   The merge pipeline treats PP and UD identically." -ForegroundColor Green
        Write-Host "   Webpage can proceed with platform-specific legEv formulas only." -ForegroundColor Green
    } else {
        Write-Host "❌ CONCLUSION: trueProb inconsistencies detected!" -ForegroundColor Red
        Write-Host "   The merge pipeline has platform bias that needs fixing." -ForegroundColor Red
        Write-Host "   Fix merge_odds.ts before building the webpage." -ForegroundColor Red
    }
}

# Run comparison if called directly
if ($MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Name) {
    Compare-TrueProb
}
