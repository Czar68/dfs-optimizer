# Phase 75 — PP merge breadth analysis

Generated: **2026-03-21T23:47:06.276Z**

## Code changes

- fetch_props: resolve stat via string stat_type, stat_display_name, or relationships.stat_type + included stat_type (id→name).
- mapPrizePicksStatType: NBA combo tokens match when spaces are removed around '+' (e.g. Pts + Rebs + Asts).
- merge_odds STAT_MAP: explicit p+a → points_assists, r+a → rebounds_assists (Odds/feed token parity).

## Fixture (`pp_projections_sample.json`)

- **RawPick count (Phase 75 mapper):** 5219

### Projection-level stat resolution (diagnostic)

- legacyStringStatTypeOnly (string stat_type, no spacing collapse): **5219**
- fullPhase75 (resolve + spacing collapse): **5219**
- gainFromStringStatPath (string stat_type, legacy null → Phase 75 non-null): **0**
- gainFromDisplayOrRelationship (non-string or missing stat_type string): **0**

## Live viability

End-to-end PP eligible legs ≥6 and PP cards require a full optimizer run with live OddsAPI + PrizePicks; fixture counts prove mapping breadth only.

- **prizepicks-legs.csv data rows (if present):** 5
