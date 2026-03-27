# Odds snapshot health

**Status:** **HEALTHY**

| Field | Value |
| --- | --- |
| EvaluatedAt (UTC) | 2026-03-24T20:43:32.679Z |
| SnapshotId | 689bf65740e5 |
| FetchedAt (UTC) | 2026-03-24T20:43:32.673Z |
| Configured refreshMode | auto |
| Effective refreshMode | live |
| Source | OddsAPI |
| Rows analyzed | 300 |

## Checks

| Check | Value | Threshold | OK |
| --- | --- | --- | --- |
| Row count | 300 | ≥ 200 | yes |
| Placeholder player share | 0.0% | ≤ 15.0% | yes |
| Distinct stats | 2 | ≥ 2 | yes |
| Age (minutes) | 0.0 | ≤ 120 | yes |

## Summary

- rows=300 (min 200) ok
- placeholderShare=0.000 (max 0.15) ok
- distinctStats=2 (min 2) ok
- ageMinutes=0.0 (max 120) ok
