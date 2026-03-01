#!/bin/bash
echo "=== Testing Underdog Multi-Sport (NBA + NHL) ==="

# Test 1: Default NBA-only
echo "1. Default NBA-only:"
node dist/run_underdog_optimizer.js --no-fetch-odds 2>&1 | grep -E "(CLI sports|Effective sports)"

# Test 2: Multi-sport NBA,NHL
echo "2. Multi-sport NBA,NHL:"
node dist/run_underdog_optimizer.js --sports NBA,NHL --no-fetch-odds 2>&1 | grep -E "(CLI sports|Effective sports)"

# Test 3: Verify Sport column in CSV
echo "3. Sport column check:"
head -1 undadog-legs.csv | grep -o "^Sport"
head -5 undadog-legs.csv | tail -4 | cut -d, -f1 | sort -u

echo "✅ All tests passed if NHL appears in effective sports and Sport column."
