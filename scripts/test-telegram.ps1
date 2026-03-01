# test-telegram.ps1
# Load .env and send a test message via Telegram (testTelegramConnection).
# Requires: Copy .env.example to .env and set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
# Usage: .\scripts\test-telegram.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

if (-not (Test-Path ".env")) {
    Write-Host "No .env found. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
    exit 1
}

# Load .env via dotenv and run telegram connection test (requires: npx tsc -p . first)
if (-not (Test-Path "dist\telegram_pusher.js")) {
    Write-Host "Run 'npx tsc -p .' first."
    exit 1
}
& node -r dotenv/config -e "require('./dist/telegram_pusher.js').testTelegramConnection().then(ok => process.exit(ok ? 0 : 1))"
exit $LASTEXITCODE
