# Feature validation — overview (Phase 108)

- **summary:** `feature_validation_overview policy=snapshot_preferred graded=16 replay_ready=0/16 strict_eligible=0/16 missing_snapshot_dir=0 legacy_wo_sid=16 snap_rows_all=0/22 snap_graded=0/16 blocked_new_wo=na override_appends=na`
- **effective_policy:** `snapshot_preferred` (from `FEATURE_VALIDATION_POLICY` or default)
- **last_export_policy (artifact):** *none*
- **tracker:** `C:\Dev\Projects\dfs-optimizer\data\perf_tracker.jsonl`

## Graded validation slice (Phase 106)

- **graded_rows (deduped):** 16
- **replay_ready_snapshot_bound:** 0
- **snapshot_bound_missing_snapshot_dir:** 0
- **strict_validation_eligible:** 0
- **legacy_without_snapshot_id:** 16

`feature_validation_replay_readiness graded=16 replay_ready=0/16 strict_eligible=0/16 legacy=16 missing_snapshot_dir=0 legacy_best_effort=0`

## Tracker snapshot adoption (Phase 104)

- **rows_with_legsSnapshotId / total:** 0/22
- **graded_with_legsSnapshotId / graded_total:** 0/16

`legs_snapshot_adoption snapshot=0/22 graded_snap=0/16 legacy_unsnapshotted=22`

## New-row enforcement (Phase 105 artifact)

*No `latest_tracker_snapshot_new_row_enforcement.json` — run backfill to refresh.*
