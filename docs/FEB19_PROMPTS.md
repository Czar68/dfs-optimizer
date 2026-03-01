# Feb 19 NBA Slate — Cursor Prompts & Targets

Deploy complete. SA auth production-ready. Netlify: add `GOOGLE_APPLICATION_CREDENTIALS` (full JSON) at [env settings](https://app.netlify.com/sites/dynamic-gingersnap-3ee837/settings/env) → Deploy.

---

## Where the prompts go

| Prompt | Where to run | Workspace |
|--------|----------------|-----------|
| **Prompt 1** (Flex/Power EV column) | Cursor Chat | **nba-props-optimizer** |
| **Prompt 2** (Kelly portfolio selector) | Cursor Chat | **nba-props-optimizer** |

Paste **one prompt per Cursor chat** (or run Prompt 1, then Prompt 2 in the same window). eBay/trade-in: no changes for these; they’re nba-props only.

---

## Prompt 1: Add Flex/Power EV Column

Paste this into a **Cursor chat** in the **nba-props-optimizer** window:

```
In Sheets optimizer/output:
1. Add columns: PowerEV, FlexEV, PlayType (Power/Flex recommendation)

2. Formulas (per parlay, p=win prob per leg):
   Power (3-leg): EV = (p^3 * 6 - 1) * stake
   Flex (3-leg): EV = (p^3 * 3 + 3*p^2*(1-p)*1 - 1) * stake

3. Recommendation: Flex if FlexEV > PowerEV > 0

Update dashboard + export CSV. Commit "feat: flex/power EV comparison"
```

**File targets:** Optimizer output columns/formulas → dashboard. (Sheets/CSV export; `sheets_test.py` only if export format changes.)

---

## Prompt 2: Kelly Portfolio Selector

Paste this into a **new Cursor chat** in the **nba-props-optimizer** window:

```
Add Kelly fraction calculator:
1. Portfolio optimizer: input multiple parlays (EV, p_success)
2. Kelly f = edge/odds per bet
3. Allocate bankroll: sum(f_i * bankroll), cap 5% per bet
4. Output: stake per parlay, total risk, expected growth

Integrate w/ flex/power selector. Test 2-6 leg NBA parlays. Commit "feat: Kelly portfolio wiring"
```

**File targets:** New `src/kellyPortfolio.ts` → integrate with `engine_interface.ts` → export CSV.

---

## Deployment

1. **Verify:** `npm run build` → drag `web-dashboard/dist/` to Netlify (or use existing deploy).
2. **Test:** Feb 19 NBA slate live via Netlify API.

---

## Summary

| Item | Location |
|------|----------|
| Flex/Power EV | Optimizer output columns → dashboard → CSV |
| Kelly | `src/kellyPortfolio.ts` + `engine_interface.ts` → CSV |

Post-deploy: test Flex EV + Kelly stakes on live Feb 19 slate.

---

## Verification (post-implementation)

| Check | Expected |
|-------|----------|
| **Flex 3-leg** | ~3× payout (2/3 correct pays) |
| **Power 3-leg** | 6× payout (all correct) |
| **Kelly** | Cap 5% bankroll per bet |
| **Netlify** | [Env](https://app.netlify.com/sites/dynamic-gingersnap-3ee837/settings/env) → `GOOGLE_APPLICATION_CREDENTIALS` (full SA JSON) → Deploy → test API → Feb 19 slate live |
