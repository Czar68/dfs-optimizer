#!/bin/bash
echo "=== Full Multi-Sport Production Test ==="

echo ""
echo "1. PrizePicks + Underdog + Odds (NBA,NHL,NCAAB)"
node dist/run_optimizer.js --sports NBA,NHL,NCAAB --no-fetch-odds

echo ""
echo "2. Verify Sport column in all CSVs"
echo "Sport columns:"
for csv in prizepicks-legs.csv prizepicks-cards.csv underdog-legs.csv underdog-cards.csv; do
  if [ -f "$csv" ]; then
    if head -1 "$csv" | grep -q Sport; then
      echo "✅ $csv OK"
    else
      echo "❌ $csv missing Sport column"
    fi
  else
    echo "⚠️  $csv not found"
  fi
done

echo ""
echo "3. Push to sheets"
python sheets_push_legs.py
python sheets_push_underdog_legs.py
python sheets_push_cards.py

echo ""
echo "✅ Production pipeline complete"
