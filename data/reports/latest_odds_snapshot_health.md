# Odds snapshot health

**Status:** **HEALTHY**

| Field | Value |
| --- | --- |
| EvaluatedAt (UTC) | 2026-03-31T17:04:23.676Z |
| SnapshotId | ed42d087f4f6 |
| FetchedAt (UTC) | 2026-03-31T16:03:57.287Z |
| Configured refreshMode | auto |
| Effective refreshMode | cache |
| Source | OddsAPI |
| Rows analyzed | 4350 |

## Checks

| Check | Value | Threshold | OK |
| --- | --- | --- | --- |
| Row count | 4350 | ≥ 200 | yes |
| Placeholder player share | 0.0% | ≤ 15.0% | yes |
| Distinct stats | 12 | ≥ 2 | yes |
| Age (minutes) | 60.4 | ≤ 120 | yes |

## Summary

- rows=4350 (min 200) ok
- placeholderShare=0.000 (max 0.15) ok
- distinctStats=12 (min 2) ok
- ageMinutes=60.4 (max 120) ok
