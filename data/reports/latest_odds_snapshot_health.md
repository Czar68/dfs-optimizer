# Odds snapshot health

**Status:** **HEALTHY**

| Field | Value |
| --- | --- |
| EvaluatedAt (UTC) | 2026-03-28T23:54:52.877Z |
| SnapshotId | c252d1fe260e |
| FetchedAt (UTC) | 2026-03-28T23:47:39.753Z |
| Configured refreshMode | auto |
| Effective refreshMode | cache |
| Source | OddsAPI |
| Rows analyzed | 2851 |

## Checks

| Check | Value | Threshold | OK |
| --- | --- | --- | --- |
| Row count | 2851 | ≥ 200 | yes |
| Placeholder player share | 0.0% | ≤ 15.0% | yes |
| Distinct stats | 12 | ≥ 2 | yes |
| Age (minutes) | 7.2 | ≤ 120 | yes |

## Summary

- rows=2851 (min 200) ok
- placeholderShare=0.000 (max 0.15) ok
- distinctStats=12 (min 2) ok
- ageMinutes=7.2 (max 120) ok
