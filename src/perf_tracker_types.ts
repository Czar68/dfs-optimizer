// src/perf_tracker_types.ts
// Schema and types for historical performance tracker (perf_tracker.jsonl).
// Step 3: optional odds-aware fields (null-safe; pipeline works when missing).

export interface PerfTrackerRow {
  date: string;           // YYYY-MM-DD game date
  leg_id: string;
  player: string;
  stat: string;
  line: number;
  book: string;
  trueProb: number;       // implied over prob at play time (for calibration)
  projectedEV: number;    // leg EV at selection time (e.g. legEv)
  playedEV: number;       // same as projectedEV (used for EV_adj = playedEV * mult)
  kelly: number;          // kelly fraction for the card
  card_tier: number;      // 1 or 2
  opp?: string;           // opponent (optional)
  scrape_stat?: number;   // actual stat value from box score (filled by scraper)
  result?: 0 | 1;         // 1 = hit (actual >= line), 0 = miss
  hist_mult?: number;     // future: calibration multiplier applied
  // Step 3: odds-aware calibration (optional)
  overOdds?: number;      // American odds for over
  underOdds?: number;     // American odds for under
  side?: "over" | "under"; // chosen side; infer from leg_id if missing
  impliedProb?: number;   // implied prob for chosen side (from americanToImpliedProb)
  oddsBucket?: string;    // e.g. "-105:-115", "+100:+120"
  // Phase 6: structure calibration fields
  platform?: string;      // "PP" | "UD" — inferred from leg_id or set by backfiller
  structure?: string;     // FlexType of the card this leg was part of, e.g. "4P", "3F", "2S"
}

export const PERF_TRACKER_PATH = "data/perf_tracker.jsonl";

export function parseTrackerLine(line: string): PerfTrackerRow | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  try {
    const row = JSON.parse(t) as PerfTrackerRow;
    if (row.leg_id && row.side == null) {
      const idUpper = (row.leg_id || "").toUpperCase();
      if (idUpper.includes("UNDER")) row.side = "under";
      else if (idUpper.includes("OVER")) row.side = "over";
      else row.side = "over";
    }
    return row;
  } catch {
    return null;
  }
}

/** Infer side from leg_id when not set: OVER/UNDER in id, else default over. */
export function inferSide(legId: string): "over" | "under" {
  const idUpper = (legId || "").toUpperCase();
  if (idUpper.includes("UNDER")) return "under";
  if (idUpper.includes("OVER")) return "over";
  return "over";
}
