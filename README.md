# NBA Props Optimizer

A TypeScript-based optimizer for NBA PrizePicks props that integrates with Google Sheets Windshark engine for EV calculations.

## PrizePicks Engine Sheet Contract

This section documents the contract between the TypeScript optimizer and the Google Sheets Windshark engine for PrizePicks EV/ROI calculations.

### Engine Sheet Configuration

- **Sheet Tab Name**: `Engine`
- **Per-Leg Hit Probability**: `Engine!$B$51` (avgProb) used by all structure calculations

### EV/ROI Cell Mapping

| Structure | EV Cell | ROI Cell |
|-----------|---------|----------|
| 2P | `Engine!B64` | `Engine!B65` |
| 3P | `Engine!B75` | `Engine!B76` |
| 3F | `Engine!B85` | `Engine!B86` |
| 4P | `Engine!B96` | `Engine!B97` |
| 4F | `Engine!B106` | `Engine!B107` |
| 5P | `Engine!B117` | `Engine!B118` |
| 5F | `Engine!B127` | `Engine!B128` |
| 6P | `Engine!B138` | `Engine!B139` |
| 6F | `Engine!B149` | `Engine!B150` |

### EV Formula

- **EV Calculation**: `EV = SUM(P(k) * Payout(k)) - 1` for a 1-unit stake
- **ROI Relationship**: ROI equals EV on a 1-unit stake
- **Binomial Logic**: Uses per-leg hit probability from `$B$51` with binomial distribution P(k)

### Single Source of Truth

**Critical Requirement**: The code must treat this Google Sheets engine as the single source of truth for PrizePicks EV/ROI calculations and must not hardcode payout tables in TypeScript.

### Implementation Contract

The TypeScript optimizer interfaces with the Sheets engine through:

```typescript
// Interface to consume EV/ROI from Google Sheets Windshark engine
export async function getStructureEVs(avgProb: number): Promise<StructureEV[]>
export async function getStructureEV(flexType: string, avgProb: number): Promise<StructureEV | null>
```

### Structure Types

- **Power Plays**: 2P, 3P, 4P, 5P, 6P (all-or-nothing payouts)
- **Flex Plays**: 3F, 4F, 5F, 6F (tiered payouts with partial hits)

### Data Flow

1. Optimizer calculates `avgProb` from leg probabilities
2. `avgProb` is equivalent to `$B$51` in the Sheets engine
3. Engine returns EV/ROI values from mapped cells
4. Code consumes these values without re-deriving payout math

## Development

### Environment Variables

```bash
# TheRundown API (backup odds source)
THERUNDOWN_API_KEY=your_api_key_here

# SGO API rate limiting
SGO_MAX_CALLS_PER_DAY=8  # Default: 8 calls per day

# Optional debug logging
DEBUG_THERUNDOWN=1
```

### Installation

```bash
npm install
```

### Running the Optimizer

```bash
npm start
```

### CLI Flags

```bash
# Disable API calls (use cache only)
--no-fetch-odds

# Force refresh regardless of cache age
--force-refresh-odds

# Set cache TTL in minutes (default: 15)
--refresh-interval-minutes=30
```

### Key Files

- `src/engine_interface.ts` - Google Sheets engine integration
- `src/card_ev.ts` - Card evaluation using Sheets EV data
- `src/run_optimizer.ts` - Main optimizer runner
- `src/merge_odds.ts` - Odds fetching and merging logic
- `src/odds_cache.ts` - Odds caching and rate limiting
- `sheets_push_cards.py` - Push card data to Google Sheets

### Odds Integration

The optimizer uses The Odds API as the single canonical odds source. Caching reduces API calls and respects rate limits.

See [INTEGRATIONS.md](./INTEGRATIONS.md) for detailed configuration.

## Architecture

The optimizer follows Windshark rules where Google Sheets is the authoritative source for PrizePicks EV calculations, ensuring consistency with established payout math and probability models.

## Automation

- **Canonical full pipeline:** `.\scripts\run_optimizer.ps1 -Force` — compile, SGO/PP/UD/TRD harvest, legs/cards, tier1/2, Sheets push, Telegram. Writes `artifacts/last_run.json` with `status":"success"` and metrics (pp_legs, ud_cards, sheets_pushed, telegram_sent).
- **Manual provider tool (ungated):** `.\scripts\run-both.ps1` — same flow with configurable providers/bankroll; no window check.
- **Four daily slots:** morning 9–10AM, afternoon 1–2PM, evening 6–7PM, overnight 10PM–1:30PM. Inside any slot, `run_optimizer.ps1` runs without `-Force`. See `docs/SCHEDULED_AUTOMATION.md` for Task Scheduler XML and test matrix.

Manual commands:

```powershell
.\scripts\auto_mode.ps1 -Mode nightly -Force
.\scripts\auto_mode.ps1 -Mode optimizer -Force
.\scripts\verify_wiring.ps1 -Flow all
```

Verify wiring (dry run only; writes `last_run.json`):

```powershell
.\scripts\verify_wiring.ps1 -Flow all
```

Scripts write to `artifacts/` (`last_run.json`, `nba_optimizer_*.md`, `logs/run_*.txt`). Optional master: `C:\Users\Media-Czar Desktop\Dev\master_auto\scripts\master_auto.ps1`.
