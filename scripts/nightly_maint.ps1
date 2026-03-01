# Nightly maintenance: PREP -> agent CLI (headless) -> verify + commit
# REQUIRE: Cursor CLI (winget install Cursor.CLI)
param([switch]$Force)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. "$PSScriptRoot\_auto_window.ps1"
if (-not (Test-AutoWindow -Force:$Force)) { Write-Output "Outside window. Use -Force."; exit 0 }

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path "artifacts","artifacts\logs" | Out-Null

# PREP: artifacts from master nightly (optional dry-run verify)
try {
    if (Test-Path "$PSScriptRoot\verify_wiring.ps1") {
        & "$PSScriptRoot\verify_wiring.ps1" -DryRun 2>$null
    }
} catch { }

# AUDIT (dfs-optimizer): before chat workflow — generate data + chat_prompt.md
try {
    npm run generate 2>&1 | Out-Null
    if (Test-Path "src\calculate_ev.ts") {
        npx ts-node src/calculate_ev.ts --debug-top10 2>&1 | Out-File -FilePath artifacts\leg_math.txt -Encoding utf8
    }
    if (Test-Path "$PSScriptRoot\perf-report.ps1") {
        & "$PSScriptRoot\perf-report.ps1" 2>&1 | Out-File -FilePath artifacts\perf_tracker.txt -Encoding utf8
    }
    if (Test-Path "prizepicks-cards.csv") {
        Get-Content "prizepicks-cards.csv" -TotalCount 20 -Encoding utf8 | Set-Content -Path artifacts\sample_cards.csv -Encoding utf8
    }
} catch { Write-Warning "Audit step failed: $_" }

# Build chat_prompt.md with audit data + backlog
$legMath = if (Test-Path "artifacts\leg_math.txt") { Get-Content "artifacts\leg_math.txt" -Raw -Encoding utf8 -ErrorAction SilentlyContinue } else { "[not generated]" }
$perfTracker = if (Test-Path "artifacts\perf_tracker.txt") { Get-Content "artifacts\perf_tracker.txt" -Raw -Encoding utf8 -ErrorAction SilentlyContinue } else { "[not generated]" }
$sampleCards = if (Test-Path "artifacts\sample_cards.csv") { Get-Content "artifacts\sample_cards.csv" -Raw -Encoding utf8 -ErrorAction SilentlyContinue } else { "[not generated]" }
$chatPrompt = @"
# DFS-Optimizer Nightly: Card Math Audit + Phase 4

## AUDIT DATA
Leg math (debug-top10):
$legMath

Perf tracker:
$perfTracker

Cards sample (first 20):
$sampleCards

## TASKS
- FIX card math: payout_math.ts (2P/3P multipliers) + card_ev.ts (4F vs 4P)
- Phase 4: perf_report.ts (player names) + kelly_stake_sizing.ts + live_edge_pusher.ts
- Verify: npm run generate → corrected EV table

## Output
- Fixed files + npm run generate showing: 2P/3P EV normalized; 4P PowerPlay > 4F Flex; perf_report with player names + Kelly `$; Telegram test ping
- End with FIXED: [description]
"@
Set-Content -Path "artifacts\chat_prompt.md" -Value $chatPrompt -Encoding utf8 -NoNewline

$promptFile = "artifacts\chat_prompt.md"
$prompt = if (Test-Path $promptFile) { Get-Content $promptFile -Raw -Encoding utf8 } else {
    if (Test-Path "docs\prompts\nightly_improvement.md") { Get-Content "docs\prompts\nightly_improvement.md" -Raw -Encoding utf8 } else { "# Nightly improvement`nApply backlog fixes and document FIXED in nightly_cursor_report.md." }
}
$reportPath = "artifacts\nightly_cursor_report.md"
$researchPath = "artifacts\research_log.md"
$part1 = if (Test-Path $reportPath) { Get-Content $reportPath -Raw -Encoding utf8 -ErrorAction SilentlyContinue } else { "" }
$part2 = if (Test-Path $researchPath) { Get-Content $researchPath -Raw -Encoding utf8 -ErrorAction SilentlyContinue } else { "" }
$context = ($part1, $part2) -join "`n"
$fullPrompt = "$prompt`n`nCONTEXT:`n$context"

# Write prompt to file for agent (avoids escaping issues)
$promptOut = "artifacts\cursor_agent_prompt_$ts.txt"
Set-Content -Path $promptOut -Value $fullPrompt -Encoding utf8 -NoNewline

# CLI AGENT: headless coding (REQUIRE: winget install Cursor.CLI)
$outputPath = "artifacts\cursor_agent_output.md"
$promptText = Get-Content $promptOut -Raw
& agent --trust --print --output-format text --model auto --output $outputPath $promptText 2>&1 | Out-File -FilePath artifacts\agent_full.log

# VERIFY + COMMIT (tuned: allow research|done|no backlog|optimized so eBay/disc agents can commit)
$commit_keywords = "(?i)(FIXED|complete|research|done|no backlog|optimized)"
if (Test-Path $outputPath) {
    $matchResult = Select-String -Path $outputPath -Pattern $commit_keywords -AllMatches -ErrorAction SilentlyContinue
    if ($matchResult) {
        $keywords = ($matchResult.Matches | ForEach-Object { $_.Value }) -join ","
        $project = Split-Path (Get-Location) -Leaf
        if (Test-Path "$PSScriptRoot\verify_wiring.ps1") {
            & "$PSScriptRoot\verify_wiring.ps1" -Flow all
        }
        git add .
        git commit -m "CLI Agent: $project ($keywords)"
        Write-Output "✅ CLI agent complete: $(git log -1 --oneline)"
    } else {
        Write-Output "⚠️ CLI agent incomplete: $outputPath"
    }
} else {
    Write-Output "⚠️ CLI agent incomplete: $outputPath"
}

# AFTER ACTION WEBHOOK (idempotent)
try {
    $fixed = if (Test-Path artifacts\cursor_agent_output.md) { (Select-String -Path artifacts\cursor_agent_output.md -Pattern "FIXED" -AllMatches -ErrorAction SilentlyContinue).Matches.Count } else { 0 }
    if ($null -eq $fixed) { $fixed = 0 }
    $backlog_left = 0
    if (Test-Path "projects.json") { try { $j = Get-Content "projects.json" -Raw | ConvertFrom-Json; if ($j.backlog) { $backlog_left = $j.backlog.Count } } catch {} }
    $output_tail = (Get-Content artifacts\cursor_agent_output.md -Tail 5 -ErrorAction SilentlyContinue) -join "`n"
    # Fix git count for webhook/dashboard (avoid -ErrorAction passed to git)
    $git_commits = try { (git log --oneline -5 2>$null) -join "`n" } catch { "No commits" }
    $report = @{
        timestamp   = (Get-Date -Format o)
        project     = (Split-Path (Get-Location) -Leaf)
        fixed       = $fixed
        backlog_left = $backlog_left
        output_tail = $output_tail
        git_commits = $git_commits
        webhook_reply_url = $env:WEBHOOK_REPLY_URL
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "https://api.perplexity.ai/webhook/master-auto" -Method POST -Body $report -ContentType "application/json"
    $telegramScript = Join-Path (Split-Path $PSScriptRoot -Parent) "..\master_auto\scripts\telegram_bot.py"
    if ($env:TELEGRAM_TOKEN -and (Test-Path $telegramScript)) { try { & python $telegramScript (Split-Path (Get-Location) -Leaf) $fixed $backlog_left 2>$null } catch { } }
} catch { }
