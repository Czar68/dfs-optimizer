#!/bin/bash
echo "=== SINGLE LIVE ODDS TEST (NBA Only) ==="

echo ""
echo "Pre-test usage:"
cat .cache/provider-usage.json

START_SGO=$(cat .cache/provider-usage.json | jq .sgoCallCount)
START_RUNDOWN=$(cat .cache/provider-usage.json | jq .rundownDataPointsUsed)

echo "Starting: SGO=$START_SGO, Rundown=$START_RUNDOWN"

echo ""
echo "LIVE TEST: NBA SGO (--force-sgo):"
node dist/run_optimizer.js --sports NBA --force-sgo --refresh-interval-minutes=1

echo ""
echo "POST-test usage:"
cat .cache/provider-usage.json

END_SGO=$(cat .cache/provider-usage.json | jq .sgoCallCount)
END_RUNDOWN=$(cat .cache/provider-usage.json | jq .rundownDataPointsUsed)

DELTA_SGO=$((END_SGO-START_SGO))
DELTA_RUNDOWN=$((END_RUNDOWN-START_RUNDOWN))

echo "USAGE DELTA: SGO +$DELTA_SGO, Rundown +$DELTA_RUNDOWN"

echo ""
echo "Verify odds source:"
grep "Odds source" run-*.log 2>/dev/null || echo "Check console output above"

echo ""
echo "Verify Sport column:"
head -1 prizepicks-legs.csv | grep "^Sport" || echo "❌ prizepicks-legs.csv missing Sport column"
head -1 underdog-legs.csv | grep "^Sport" || echo "❌ underdog-legs.csv missing Sport column"

echo ""
echo "=== Test Complete ==="
