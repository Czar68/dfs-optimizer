# Odds Provider Integrations

This document describes the odds providers integrated into the multi-sport props optimizer and their fallback behavior.

## Current Scope (Multi-Sport Support)

**SPORT SUPPORT**: This infrastructure now supports multiple sports including NBA, NHL, NFL, MLB, NCAAB, and NCAAB.

### Platform Coverage
- **PrizePicks**: Multi-sport player props (NBA, NHL, NFL, MLB)
- **Underdog**: Multi-sport player props (NBA, NHL, NFL, MLB)  
- **SGO/Rundown**: Multi-sport odds with sport-specific endpoints

### Sport-Specific Notes
- Sport-specific stat mappings and league configurations for each supported sport
- Cache and rate limiting are sport-aware and track usage per sport
- Merge logic matches on (sport, player, stat, line) for proper sport isolation
- CLI `--sports` flag controls which sports to process (default: NBA)

### CSV and Sheets Integration
- **Sport Column**: All CSV outputs and Google Sheets now include Sport as the first column (column A)
- **Column Shift**: Existing columns shifted right by 1 position (id is now column B, player is column C, etc.)
- **Sheets Ranges Updated**: 
  - Legs: A2:P (was A2:O)
  - UD-Legs: A2:Q (was A2:P) 
  - Cards: A2:AF (was A2:AE)

## Underdog Multi-Sport (Complete)

- **CLI**: `--sports NBA,NHL` works identically to PrizePicks path.
- **Environment filtering**: `getAllowedUDLeagues()` intersection preserved.
- **RawPick tagging**: Every Underdog prop tagged with `sport: Sport`.
- **CSV/Sheets**: Sport column A populated from `leg.sport` (legs) and `card.legs[0].sport` (cards).
- **Odds merge**: `(sport, player, stat, line)` matching prevents cross-sport contamination.
- **Backward compatibility**: `--sports` absent → NBA-only default.

**Test command**:
```bash
node dist/run_underdog_optimizer.js --sports NBA,NHL
# Should fetch both sports (subject to getAllowedUDLeagues()) 
# and show Sport column correctly in undadog-legs.csv / undadog-cards.csv
```

## Overview

The optimizer uses a hierarchical fallback system for player prop odds:

1. **Primary**: SportsGameOdds (SGO) - Sharp book odds
2. **Backup**: TheRundown v2 API - Consensus odds when SGO fails
3. **Failure**: No odds available - Proceed with empty odds array

## SportsGameOdds (SGO)

**Role**: Primary odds source
- **Provider**: SportsGameOdds.com
- **Coverage**: ~80 bookmakers, sharp books included
- **Markets**: Points, rebounds, assists, threes, blocks, steals, turnovers, combos
- **Rate Limits**: Handled by SGO's own rate limiting
- **Authentication**: Built-in SGO API credentials

### Usage
SGO is always tried first. If SGO returns data successfully, the optimizer uses those odds directly without falling back.

## TheRundown v2 API

**Role**: Backup odds source when SGO fails or returns empty data
- **Provider**: TheRundown.io
- **Plan**: Free tier (1,000 data points/day)
- **Coverage**: 3 bookmakers (configurable)
- **Markets**: Player props (points, rebounds, assists, combos)
- **Rate Limits**: 1,000 data points per day (free plan)

### Environment Variables

```bash
# TheRundown API (backup odds source)
THERUNDOWN_API_KEY=your_api_key_here

# SGO API rate limiting
SGO_MAX_CALLS_PER_DAY=8  # Default: 8 calls per day

# Optional debug logging
DEBUG_THERUNDOWN=1
```

### Rate Limiting

The system tracks usage for both providers to stay within limits:

#### SGO Rate Limiting
- **Daily Cap**: Configurable via `SGO_MAX_CALLS_PER_DAY` (default: 8)
- **Tracking File**: `.cache/provider-usage.json`
- **Reset**: Daily at midnight UTC
- **Behavior**: When limit reached, skips SGO calls and falls back to TheRundown

#### TheRundown Rate Limiting
- **Daily Cap**: 1,000 data points (free plan)
- **Tracking File**: `.cache/provider-usage.json` (same file as SGO)
- **Reset**: Daily at midnight UTC
- **Behavior**: When limit reached, skips TheRundown calls

### Consensus Algorithm

TheRundown data is processed through a consensus algorithm:

1. **Pair Over/Under**: Groups odds by book for each prop
2. **Outlier Filter**: Removes extreme books using 3×MAD threshold
3. **Weighted Average**: Applies book weights:
   - FanDuel: 1.0
   - Pinnacle: 0.7
   - Circa: 0.7
   - Others: 0.3
4. **Minimum Books**: Requires ≥2 books after filtering
5. **Fallback**: Uses all books if filtering leaves <2

### Market Mapping

| TheRundown Market | Optimizer Stat |
|------------------|----------------|
| Player Points | points |
| Player Rebounds | rebounds |
| Player Assists | assists |
| Player Threes | threes |
| Player Blocks | blocks |
| Player Steals | steals |
| Player Turnovers | turnovers |
| Player Points + Rebounds | pr |
| Player Points + Assists | pa |
| Player Rebounds + Assists | ra |
| Player Points + Rebounds + Assists | pra |

## Caching and Rate Control

### Cache File
- **Location**: `.cache/odds-cache.json`
- **TTL**: 15 minutes (configurable with `--refresh-interval-minutes`)
- **Content**: Merged odds + API call metadata

### CLI Flags

```bash
# Disable all API calls (use cache only)
--no-fetch-odds

# Force refresh regardless of cache age
--force-refresh-odds

# Set cache TTL in minutes (default: 15)
--refresh-interval-minutes=30

# Show help
--help
```

### API Call Logging

Every external API request is logged with:
- **Timestamp**: ISO 8601 format
- **Provider**: "SGO" or "TheRundown"
- **Reason**: 
  - `scheduled`: Normal refresh
  - `force-refresh`: User forced refresh
  - `cache-stale`: Cache expired
  - `sgo-failed`: SGO error/empty
  - `rundown-failed`: TheRundown error

Example log output:
```
[API] 2026-02-12T22:48:35.099Z SGO (scheduled)
[API] 2026-02-12T22:48:36.123Z TheRundown (sgo-failed)
```

## Fallback Behavior

#### Normal Flow
1. Check cache for valid data
2. If cache valid → Use cached odds
3. If cache invalid → Fetch fresh odds

#### Fresh Odds Flow
1. **Check SGO Limits**: Verify SGO daily call limit not reached
2. **Try SGO API**: If within limits, call SGO API
3. **If SGO Succeeds**: Use SGO odds, cache result, record usage
4. **If SGO Fails/Empty/Limited**: Try TheRundown API
5. **Check TheRundown Limits**: Verify data point limit not exceeded
6. **If TheRundown Succeeds**: Use consensus odds, cache result, record usage
7. **If Both Fail/Limited**: Return empty array, log failure

#### Rate Limit Scenarios
- **SGO Limit Reached**: "Skipping SGO: SGO daily call limit reached (X/Y)"
- **TheRundown Limit Reached**: "Skipping TheRundown: daily data point limit would be exceeded"
- **Both Limited**: "Both SGO and TheRundown unavailable, returning empty odds"

### Error Handling
- **SGO Errors**: Logged, trigger TheRundown fallback
- **TheRundown Errors**: Logged, return empty odds
- **Rate Limits**: Logged, skip API calls when limits hit
- **Network Issues**: Logged, return empty odds

## Debug Mode

Enable debug logging for detailed diagnostics:

```bash
# TheRundown debug
DEBUG_THERUNDOWN=1 npx ts-node src/run_optimizer.ts --force-refresh-odds

# Shows:
# - API request URLs and parameters
# - Response structure analysis
# - Market mapping details
# - Consensus calculation steps
# - Rate limit tracking
```

## Getting Started

1. **Get TheRundown API Key**:
   - Visit https://therundown.io/api
   - Sign up for free plan
   - Copy API key

2. **Set Environment Variables**:
   ```bash
   export THERUNDOWN_API_KEY=your_key_here
   ```

3. **Test Integration**:
   ```bash
   DEBUG_THERUNDOWN=1 npx ts-node src/run_optimizer.ts --force-refresh-odds
   ```

4. **Monitor Usage**:
   - Check `.cache/therundown-rate-limit.json` for daily usage
   - Monitor console logs for API call tracking
   - Adjust cache TTL if needed

## Google Sheets Formula Updates (Manual Step Required)

**IMPORTANT**: The following manual updates must be made to the Google Sheets formulas to accommodate the new Sport column (Column A):

### Required Formula Changes

#### Legs! Tab
- **Old Range**: `A2:O1000` → **New Range**: `B2:P1000` (shifted right by 1 column)
- **Sport Column**: Column A now contains sport values for filtering
- **Example**: Any formula referencing `B2:P1000` remains the same since columns shifted right

#### UD-Legs! Tab  
- **Old Range**: `A2:P1000` → **New Range**: `B2:Q1000` (shifted right by 1 column)
- **Sport Column**: Column A now contains sport values for filtering

#### Cards! Tab
- **Old Range**: `A2:AE1000` → **New Range**: `B2:AF1000` (shifted right by 1 column)  
- **Sport Column**: Column A now contains sport values for filtering

### New Filtering Capabilities

1. **Sport Filter/Slicer**: Add a data slicer on Column A to filter by sport:
   - Select Column A → Data → Slicer
   - Enables per-sport analysis (NBA only, NHL only, NCAAB only, or multi-sport)

2. **Per-Sport Analysis**: Formulas can now reference Column A for sport-specific logic:
   ```
   =IF(A2="NBA", [nba_formula], IF(A2="NHL", [nhl_formula], [default_formula]))
   ```

### Verification Steps

1. Confirm Sport column (A) is populated in all tabs
2. Test that existing formulas still work with shifted ranges  
3. Add sport slicer for interactive filtering
4. Validate per-sport EV thresholds are working correctly

### Notes

- All existing column references remain the same relative to their new positions
- The Sport column addition preserves all existing functionality
- No changes needed to Python push scripts (they already handle Sport column)

## Migration from Odds-API.io

The previous Odds-API.io integration has been completely replaced:

- **Removed**: `src/odds/sources/oddsApiIoNbaProps.ts`
- **Removed**: `src/odds/oddsApiIoClient.ts`
- **Added**: `src/odds/sources/therundownNbaProps.ts`
- **Updated**: `merge_odds.ts` to use TheRundown as backup
- **Updated**: Cache types to support "TheRundown" source

The fallback order is now: **SGO → TheRundown → No odds**.
