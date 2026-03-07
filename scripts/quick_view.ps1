# quick_view.ps1 -- Quick console view of top cards by tier
# Usage: .\scripts\quick_view.ps1 -Tier core -Count 10

param(
  [string]$Tier = "core",
  [int]$Count = 10
)

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Load-Cards($csvPath) {
  if (-not (Test-Path $csvPath)) { return @() }
  $lines = Get-Content $csvPath -Encoding UTF8
  if ($lines.Count -le 1) { return @() }
  $header = $lines[0].Split(",")
  $cards = @()
  foreach ($line in $lines[1..($lines.Count-1)]) {
    $fields = $line.Split(",")
    if ($fields.Count -lt $header.Count) { continue }
    $card = @{}
    for ($i=0; $i -lt $header.Count; $i++) { $card[$header[$i]] = $fields[$i] }
    $cards += $card
  }
  return $cards
}

$ppCards = @(Load-Cards (Join-Path $root "prizepicks-cards.csv"))
$udCards = @(Load-Cards (Join-Path $root "underdog-cards.csv"))
$all = @()
$all += $ppCards
$all += $udCards

if ($Tier -eq "all") {
  $filtered = $all | Sort-Object { [double]($_.cardEv) } -Descending
} elseif ($Tier -eq "core") {
  $filtered = $all | Where-Object { $_.bestBetTier -eq "core" -or $_.bestBetTier -eq "must_play" -or $_.bestBetTier -eq "strong" } | Sort-Object { [double]($_.bestBetScore) } -Descending
} elseif ($Tier -eq "must_play") {
  $filtered = $all | Where-Object { $_.bestBetTier -eq "must_play" } | Sort-Object { [double]($_.bestBetScore) } -Descending
} else {
  $filtered = $all | Where-Object { $_.bestBetTier -eq $Tier } | Sort-Object { [double]($_.bestBetScore) } -Descending
}

$top = @($filtered | Select-Object -First $Count)

Write-Host ""
Write-Host "=== TOP $Count $($Tier.ToUpper()) CARDS ===" -ForegroundColor Cyan
Write-Host "Site-Leg  Tier    EV%      Win%     Edge%    Kelly    Player-Prop-Line"
Write-Host ("-" * 100)

$totalStake = 0
foreach ($c in $top) {
  $ev = [math]::Round([double]$c.cardEv * 100, 1)
  $winRaw = $c.winProbCash
  if ($winRaw) { $win = [math]::Round([double]$winRaw * 100, 1).ToString() + "%" } else { $win = "n/a" }
  $edgeRaw = [double]$c.avgEdgePct
  if ($edgeRaw -le 1) { $edgeRaw = $edgeRaw * 100 }
  $edge = [math]::Round($edgeRaw, 1)
  $kelly = [math]::Round([double]$c.kellyStake, 2)
  $totalStake += $kelly

  $sl = $c.'Site-Leg'
  if (-not $sl) { $sl = ($c.site + "-" + $c.flexType).ToLower() }
  $sl = $sl.PadRight(8).Substring(0, 8)

  $t = $c.bestBetTier
  if (-not $t) { $t = "n/a" }
  $t = $t.PadRight(6).Substring(0, 6)

  $ppl = $c.'Player-Prop-Line'
  if (-not $ppl) { $ppl = "" }
  if ($ppl.Length -gt 44) { $ppl = $ppl.Substring(0, 44) }

  Write-Host "$sl  $t  $($ev.ToString().PadLeft(5))%   $($win.PadLeft(6))   $($edge.ToString().PadLeft(5))%  `$$($kelly.ToString("0.00").PadLeft(6))  $ppl"
}

Write-Host ("-" * 100)
Write-Host "Total stake: `$$([math]::Round($totalStake, 2)) | Cards: $($top.Count) | Bankroll: `$600" -ForegroundColor Green
