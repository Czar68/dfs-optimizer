/**
 * Phase 119 — `ContextFeatureRecord` rows for **`home_away_split`** and **`schedule_rest`**
 * from grounded tracker / historical-feature fields only (no new APIs).
 *
 * Source alignment: same fields as **`HistoricalFeatureRow`** in **`historical_feature_extract.ts`**
 * (`homeAway` from **`PerfTrackerRow`**; **`daysRest`**, **`isBackToBack`**, **`playerGamesInLast4CalendarDays`**
 * computed there from prior resolved player rows).
 */

import type { ContextFeatureRecord } from "./context_feature_contract";

/** Grounded schedule/home fields (matches **`HistoricalFeatureRow`** subset). */
export interface ScheduleHomeAwayFields {
  homeAway: "home" | "away" | null;
  daysRest: number | null;
  isBackToBack: boolean | null;
  playerGamesInLast4CalendarDays: number | null;
}

export interface ScheduleHomeAwayContextInput extends ScheduleHomeAwayFields {
  subjectId: string;
  asOfUtc: string;
  /** e.g. `historical_feature_extract` | `perf_tracker_row_only` */
  provenance: string;
}

/**
 * Emits zero or more records. Skips any field that is null / non-finite (no fabricated precision).
 *
 * - **`home_away_role`** (`home_away_split`, categorical): only when **`homeAway`** is **`home`** or **`away`**.
 * - **`days_rest`** (`schedule_rest`, count): integer days between prior resolved game and this row.
 * - **`is_back_to_back`** (`schedule_rest`, count): **0** or **1** (boolean encoded).
 * - **`player_games_last_4_calendar_days`** (`schedule_rest`, count): distinct game dates in **[date−3, date]** window.
 */
export function buildScheduleHomeAwayContextRecords(input: ScheduleHomeAwayContextInput): ContextFeatureRecord[] {
  const { subjectId, asOfUtc, provenance } = input;
  const out: ContextFeatureRecord[] = [];

  const ha = input.homeAway;
  if (ha === "home" || ha === "away") {
    out.push({
      key: "home_away_role",
      family: "home_away_split",
      kind: "categorical",
      subjectId,
      asOfUtc,
      value: ha,
      provenance,
    });
  }

  const dr = input.daysRest;
  if (dr != null && Number.isFinite(dr)) {
    out.push({
      key: "days_rest",
      family: "schedule_rest",
      kind: "count",
      subjectId,
      asOfUtc,
      value: Math.round(dr),
      provenance,
    });
  }

  if (input.isBackToBack != null) {
    out.push({
      key: "is_back_to_back",
      family: "schedule_rest",
      kind: "count",
      subjectId,
      asOfUtc,
      value: input.isBackToBack ? 1 : 0,
      provenance,
    });
  }

  const g4 = input.playerGamesInLast4CalendarDays;
  if (g4 != null && Number.isFinite(g4)) {
    out.push({
      key: "player_games_last_4_calendar_days",
      family: "schedule_rest",
      kind: "count",
      subjectId,
      asOfUtc,
      value: Math.round(g4),
      provenance,
    });
  }

  return out;
}
