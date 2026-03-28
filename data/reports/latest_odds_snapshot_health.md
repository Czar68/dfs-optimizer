# Odds snapshot health

**Status:** **HEALTHY**

| Field | Value |
| --- | --- |
| EvaluatedAt (UTC) | 2026-03-28T21:51:47.956Z |
| SnapshotId | 0c65e6e093f6 |
| FetchedAt (UTC) | 2026-03-28T21:16:41.002Z |
| Configured refreshMode | auto |
| Effective refreshMode | cache |
| Source | OddsAPI |
| Rows analyzed | 3840 |

## Checks

| Check | Value | Threshold | OK |
| --- | --- | --- | --- |
| Row count | 3840 | ≥ 200 | yes |
| Placeholder player share | 0.0% | ≤ 15.0% | yes |
| Distinct stats | 12 | ≥ 2 | yes |
| Age (minutes) | 35.1 | ≤ 120 | yes |

## Summary

- rows=3840 (min 200) ok
- placeholderShare=0.000 (max 0.15) ok
- distinctStats=12 (min 2) ok
- ageMinutes=35.1 (max 120) ok
