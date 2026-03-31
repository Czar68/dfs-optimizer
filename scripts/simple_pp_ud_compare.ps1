# Simple PP vs UD trueProb comparison

Write-Host "=== PP vs UD TRUEPROB COMPARISON ===" -ForegroundColor Green

# Get PP data
$ppContent = Get-Content "prizepicks-legs.csv"
$ppHeaders = $ppContent[0].Split(',')
$ppPlayerIndex = [Array]::IndexOf($ppHeaders, "player")
$ppStatIndex = [Array]::IndexOf($ppHeaders, "stat")
$ppLineIndex = [Array]::IndexOf($ppHeaders, "line")
$ppTrueProbIndex = [Array]::IndexOf($ppHeaders, "trueProb")
$ppLegEvIndex = [Array]::IndexOf($ppHeaders, "legEv")

# Get UD data
$udContent = Get-Content "underdog-legs.csv"
$udHeaders = $udContent[0].Split(',')
$udPlayerIndex = [Array]::IndexOf($udHeaders, "player")
$udStatIndex = [Array]::IndexOf($udHeaders, "stat")
$udLineIndex = [Array]::IndexOf($udHeaders, "line")
$udTrueProbIndex = [Array]::IndexOf($udHeaders, "trueProb")
$udLegEvIndex = [Array]::IndexOf($udHeaders, "legEv")

Write-Host "PP legs: $($ppContent.Count - 1)" -ForegroundColor Cyan
Write-Host "UD legs: $($udContent.Count - 1)" -ForegroundColor Cyan
Write-Host ""

# Extract PP legs
$ppLegs = @()
for ($i = 1; $i -lt $ppContent.Count; $i++) {
    $fields = $ppContent[$i].Split(',')
    $player = $fields[$ppPlayerIndex]
    $stat = $fields[$ppStatIndex]
    $line = $fields[$ppLineIndex]
    $trueProb = [double]$fields[$ppTrueProbIndex]
    $legEv = [double]$fields[$ppLegEvIndex]
    $key = "$player-$stat-$line"
    
    $ppLegs[$key] = @{
        Player = $player
        Stat = $stat
        Line = $line
        TrueProb = $trueProb
        LegEv = $legEv
    }
}

# Extract UD legs
$udLegs = @()
for ($i = 1; $i -lt $udContent.Count; $i++) {
    $fields = $udContent[$i].Split(',')
    $player = $fields[$udPlayerIndex]
    $stat = $fields[$udStatIndex]
    $line = $fields[$udLineIndex]
    $trueProb = [double]$fields[$udTrueProbIndex]
    $legEv = [double]$fields[$udLegEvIndex]
    $key = "$player-$stat-$line"
    
    $udLegs[$key] = @{
        Player = $player
        Stat = $stat
        Line = $line
        TrueProb = $trueProb
        LegEv = $legEv
    }
}

# Find matches
$matchingKeys = @()
foreach ($key in $ppLegs.Keys) {
    if ($udLegs.ContainsKey($key)) {
        $matchingKeys += $key
    }
}

Write-Host "Matching props: $($matchingKeys.Count)" -ForegroundColor Yellow
Write-Host ""

if ($matchingKeys.Count -eq 0) {
    Write-Host "No matching props found" -ForegroundColor Red
    Write-Host ""
    
    # Check for common players
    $ppPlayers = @()
    foreach ($leg in $ppLegs.Values) {
        $ppPlayers += $leg.Player
    }
    $ppPlayers = $ppPlayers | Sort-Object -Unique
    
    $udPlayers = @()
    foreach ($leg in $udLegs.Values) {
        $udPlayers += $leg.Player
    }
    $udPlayers = $udPlayers | Sort-Object -Unique
    
    $commonPlayers = $ppPlayers | Where-Object { $_ -in $udPlayers }
    Write-Host "Common players: $($commonPlayers.Count)" -ForegroundColor Yellow
    
    if ($commonPlayers.Count -gt 0) {
        Write-Host "Common player: $($commonPlayers[0])" -ForegroundColor White
        Write-Host ""
        
        $player = $commonPlayers[0]
        Write-Host "PP props for ${player}:" -ForegroundColor White
        foreach ($leg in $ppLegs.Values) {
            if ($leg.Player -eq $player) {
                Write-Host "  $($leg.Stat) $($leg.Line): trueProb=$($leg.TrueProb.ToString('F6'))"
            }
        }
        Write-Host ""
        Write-Host "UD props for ${player}:" -ForegroundColor White
        foreach ($leg in $udLegs.Values) {
            if ($leg.Player -eq $player) {
                Write-Host "  $($leg.Stat) $($leg.Line): trueProb=$($leg.TrueProb.ToString('F6'))"
            }
        }
    }
} else {
    Write-Host "Found $($matchingKeys.Count) matching props!" -ForegroundColor Green
    Write-Host ""
    
    foreach ($key in $matchingKeys | Select-Object -First 5) {
        $ppLeg = $ppLegs[$key]
        $udLeg = $udLegs[$key]
        $diff = [Math]::Abs($ppLeg.TrueProb - $udLeg.TrueProb)
        
        Write-Host "${key}:" -ForegroundColor White
        Write-Host "  PP: trueProb=$($ppLeg.TrueProb.ToString('F6')), legEv=$($ppLeg.LegEv.ToString('F6'))"
        Write-Host "  UD: trueProb=$($udLeg.TrueProb.ToString('F6')), legEv=$($udLeg.LegEv.ToString('F6'))"
        Write-Host "  Diff: $($diff.ToString('F6'))" -ForegroundColor $(if ($diff -lt 0.001) { 'Green' } else { 'Red' })
        Write-Host ""
    }
}

Write-Host "=== ANALYSIS COMPLETE ===" -ForegroundColor Green
