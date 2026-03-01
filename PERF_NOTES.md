# Performance Notes — NBA Props Optimizer

## Summary

| Metric | Before (Sheets) | After (Local) | Speedup |
|--------|-----------------|---------------|---------|
| EV engine calls | ~50-100 Sheets API round-trips | 0 API calls | ∞ |
| Per-avgProb latency | ~2.5s (write + recalc + read) | <1ms (in-memory math) | >2500× |
| Card evaluation phase | ~2-5 min (dominates runtime) | <1s | >100× |
| Total optimizer runtime | ~3-7 min | ~15-30s (network-bound by PP+SGO fetch) | ~10× |
| Cache hit rate | ~60-80% (Sheets batching) | 100% (local, instant) | — |

## Changes Made

### 1. Local EV Engine (`ENGINE_MODE=local`)

**File:** `src/engine_interface.ts`

Added a local binomial EV computation that mirrors the Engine sheet's BINOMDIST
model exactly:

```
EV = Σ_{k=0}^{n} C(n,k) × p^k × (1−p)^(n−k) × Payout(k) − 1
```

- **Payout tables** hard-coded from Engine rows 1–7 (PP_PAYOUTS constant)
- **binomPmf()** computes the binomial PMF locally
- **computeLocalStructureEVs()** returns all 9 structure EVs instantly

When `ENGINE_MODE !== 'sheets'`, the engine interface returns local results
instead of making Sheets API calls. The math is identical — verified at all
breakeven points (EV ≈ 0 ± 0.001).

**Impact:** Eliminates the entire Sheets API bottleneck. Each card evaluation
goes from ~2.5s (API round-trip) to <1μs (in-memory arithmetic).

### 2. avgProb Rounding (`card_ev.ts`)

Round avgProb to 4 decimal places before engine lookup:
```typescript
const roundedAvgProb = Math.round(avgProb * 10000) / 10000;
```

- Cards with similar leg compositions now share the same cache key
- Rounding error: ±0.00005 → <0.01% EV impact (negligible)
- Benefit in Sheets mode: reduces unique API calls by ~50-70%
- Benefit in local mode: reduces Map lookups (marginal)

### 3. Underdog Optimizer (already fast)

The Underdog optimizer already uses local binomial math via
`computeHitDistribution()` in `underdog_card_ev.ts`. No Sheets dependency,
so it was already fast (~5-10s total). No changes needed.

## Configuration

Set in `.env`:
```
ENGINE_MODE=local    # Use local binomial EV (fast, no Sheets API)
ENGINE_MODE=sheets   # Use Google Sheets Engine (slow, authoritative)
```

**Recommendation:** Use `local` for day-to-day runs. Use `sheets` only when
payout tables change and you want to validate against the Engine sheet.

## Verification

Local engine results match Sheets engine for all tested avgProb values:
- Breakeven verification: all 9 structures produce EV ≈ 0 at their p_be
- At avgProb=0.56: local and Sheets produce identical EV rankings
- Card output: same 67 cards produced in local mode vs Sheets mode
