#!/bin/bash
echo "=== LIVE THERUNDOWN TEST (NBA Only) ==="

echo ""
echo "Pre-usage:"
cat .cache/provider-usage.json

START_RUNDOWN=$(cat .cache/provider-usage.json | jq .rundownDataPointsUsed)

echo "Starting Rundown: $START_RUNDOWN"

echo ""
echo "LIVE THERUNDOWN: Force Rundown, skip SGO"
rm -f .cache/odds-cache.json  # Bypass cache  
node dist/run_optimizer.js --sports NBA --force-rundown --refresh-interval-minutes=1

echo ""
echo "Verify TheRundown hit:"
grep "Odds source.*TheRundown\|TheRundown.*fresh" run-*.log 2>/dev/null || echo "Check console output above"

echo ""
echo "Post-usage:"
cat .cache/provider-usage.json
END_RUNDOWN=$(cat .cache/provider-usage.json | jq .rundownDataPointsUsed)
echo "Rundown delta: +$((END_RUNDOWN-START_RUNDOWN)) points (~100 expected)"

echo ""
echo "Verify Kelly columns:"
echo "Kelly columns:"
tail -1 underdog-cards.csv | grep -o ",[0-9]\+\.[0-9]\{2\},[0-9]\+\.[0-9]\{2\}$" && echo "✅ Kelly columns found" || echo "❌ Kelly columns missing"

echo ""
echo "Full header:"
head -1 underdog-cards.csv

echo ""
echo "=== Test Complete ==="
