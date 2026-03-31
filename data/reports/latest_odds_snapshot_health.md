# Odds snapshot health

**Status:** **HEALTHY**

| Field | Value |
| --- | --- |
| EvaluatedAt (UTC) | 2026-03-31T21:58:49.658Z |
| SnapshotId | a378d4f8a706 |
| FetchedAt (UTC) | 2026-03-31T21:51:15.675Z |
| Configured refreshMode | auto |
| Effective refreshMode | cache |
| Source | OddsAPI |
| Rows analyzed | 5632 |

## Checks

| Check | Value | Threshold | OK |
| --- | --- | --- | --- |
| Row count | 5632 | ≥ 200 | yes |
| Placeholder player share | 0.0% | ≤ 15.0% | yes |
| Distinct stats | 12 | ≥ 2 | yes |
| Age (minutes) | 7.6 | ≤ 120 | yes |

## Summary

- rows=5632 (min 200) ok
- placeholderShare=0.000 (max 0.15) ok
- distinctStats=12 (min 2) ok
- ageMinutes=7.6 (max 120) ok
