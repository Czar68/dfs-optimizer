# Final selection — reason attribution

- **generatedAtUtc:** 2026-03-31T21:59:15.372Z
- **runTimestampEt:** 2026-03-31T17:58:49 ET
- **schemaVersion:** 1

## PrizePicks
- PP: per_type_min_ev=0, breakeven=0, anti_dilution_adjustments=0, export_cap=4. Dominant removal: export_cap_truncation.
- **Dominant removal (excl. anti-dilution as removal):** export_cap_truncation
- **SelectionEngine:** not_applicable_no_cross_card_suppression_in_selection_engine

### Counts by reason
- `anti_dilution_structure_adjustment`: 0
- `breakeven_filter_removal`: 0
- `export_cap_truncation`: 4
- `per_type_min_ev_removal`: 0

### postStructureEvaluationBuild_to_postPerTypeMinEvFilter
- Structure evaluation build → per-type min EV filter

### postPerTypeMinEvFilter_to_postFinalSelection
- Per-type min EV pool → SelectionEngine (breakeven + anti-dilution)

### postFinalSelection_to_postExportCap
- Ranked pool → export cap slice
  - `export_cap_truncation`: 4
