# Phase 77 — Portfolio diversification

Generated: **2026-03-31T17:04:35.856Z**

## PrizePicks

### Policy

```json
{
  "penaltyPerLegExposure": 0.012,
  "penaltyPerPlayerLegSlot": 0.004,
  "penaltyPerPlayerStatExposure": 0.006,
  "penaltyPerGameLegExposure": 0.003,
  "penaltyPerSharedLegWithSelected": 0.025,
  "maxLegOccurrencesHard": 3,
  "maxPlayerLegSlotsHard": 14,
  "maxPairwiseSharedLegsHard": 4
}
```

### Counts

- **Candidates:** 5
- **Export cap:** 5
- **Diversified exported:** 5
- **Greedy stopped early:** no
- **Max pairwise leg overlap:** 0

### Top repeated legs (raw top-K vs diversified)

**Raw top-K**

- `prizepicks:amen thompson:points:14.5:over:game`: 1
- `prizepicks:bennedict mathurin:points:15.5:over:game`: 1
- `prizepicks:brook lopez:points:8.5:over:game`: 1
- `prizepicks:darius garland:points:16.5:over:game`: 1
- `prizepicks:devin booker:points:24.5:over:game`: 1
- `prizepicks:grant williams:pra:9.5:over:game`: 1
- `prizepicks:jabari smith:points:12.5:over:game`: 1
- `prizepicks:jalen brunson:points:22.5:over:game`: 1

**Diversified**

- `prizepicks:amen thompson:points:14.5:over:game`: 1
- `prizepicks:bennedict mathurin:points:15.5:over:game`: 1
- `prizepicks:brook lopez:points:8.5:over:game`: 1
- `prizepicks:darius garland:points:16.5:over:game`: 1
- `prizepicks:devin booker:points:24.5:over:game`: 1
- `prizepicks:grant williams:pra:9.5:over:game`: 1
- `prizepicks:jabari smith:points:12.5:over:game`: 1
- `prizepicks:jalen brunson:points:22.5:over:game`: 1

### Exported cards

1. **5F** rawEV=0.88626 adj=0.88626 pen=0.00000
2. **6F** rawEV=0.58829 adj=0.56729 pen=0.02100
3. **6F** rawEV=0.57349 adj=0.53149 pen=0.04200
4. **3P** rawEV=0.20244 adj=0.17544 pen=0.02700
5. **4P** rawEV=0.11689 adj=0.06289 pen=0.05400

## Underdog

Diversification **disabled** or no report — export used raw EV ranking + cap slice only.
