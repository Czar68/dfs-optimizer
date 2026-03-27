# Final selection — reason attribution

- **generatedAtUtc:** 2026-03-27T19:33:27.389Z
- **runTimestampEt:** 2026-03-27T15:32:38 ET
- **schemaVersion:** 1

## PrizePicks
- PP: per_type_min_ev=0, breakeven=0, anti_dilution_adjustments=0, export_cap=295. Dominant removal: export_cap_truncation.
- **Dominant removal (excl. anti-dilution as removal):** export_cap_truncation
- **SelectionEngine:** not_applicable_no_cross_card_suppression_in_selection_engine

### Counts by reason
- `anti_dilution_structure_adjustment`: 0
- `breakeven_filter_removal`: 0
- `export_cap_truncation`: 295
- `per_type_min_ev_removal`: 0

### postStructureEvaluationBuild_to_postPerTypeMinEvFilter
- Structure evaluation build → per-type min EV filter

### postPerTypeMinEvFilter_to_postFinalSelection
- Per-type min EV pool → SelectionEngine (breakeven + anti-dilution)

### postFinalSelection_to_postExportCap
- Ranked pool → export cap slice
  - `export_cap_truncation`: 295

## Underdog
- UD: breakeven=0, anti_dilution_adjustments=284, export_cap=660. Dominant removal: export_cap_truncation.
- **Dominant removal (excl. anti-dilution as removal):** export_cap_truncation
- **SelectionEngine:** not_applicable_no_cross_card_suppression_in_selection_engine

### Counts by reason
- `anti_dilution_structure_adjustment`: 284
- `breakeven_filter_removal`: 0
- `export_cap_truncation`: 660
- `per_type_min_ev_removal`: 0

### postStructureEvaluationBuild_to_postFinalSelection
- Built candidate pool → SelectionEngine (breakeven + anti-dilution) + UD export sort
  - `anti_dilution_structure_adjustment`: 284

### postFinalSelection_to_postExportCap
- Ranked pool → export cap slice
  - `export_cap_truncation`: 660
