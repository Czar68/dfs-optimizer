// src/odds_buckets.ts
// Step 3: odds bucket assignment for calibration (e.g. "-105:-115", "+100:+120").

/**
 * Assign an American odds value to a bucket label for the chosen side.
 * Negative juice: ranges like -115 to -105 (label "-115:-105").
 * Plus-money: "+100:+120", etc.
 */
const NEG_BUCKETS: { low: number; high: number; label: string }[] = [
  { low: -125, high: -115, label: "-125:-115" },
  { low: -115, high: -105, label: "-115:-105" },
  { low: -105, high: -95, label: "-105:-95" },
  { low: -140, high: -125, label: "-140:-125" },
  { low: -200, high: -140, label: "-200:-140" },
  { low: -999, high: -200, label: "-999:-200" },
];

const PLUS_BUCKETS: { min: number; max: number; label: string }[] = [
  { min: 95, max: 105, label: "+95:+105" },
  { min: 100, max: 120, label: "+100:+120" },
  { min: 120, max: 150, label: "+120:+150" },
  { min: 150, max: 250, label: "+150:+250" },
  { min: 250, max: 9999, label: "+250:+" },
];

function oddsForSide(overOdds: number | undefined, underOdds: number | undefined, side: "over" | "under"): number | undefined {
  if (side === "over") return overOdds;
  return underOdds;
}

/** Return odds bucket string for the chosen side (e.g. -110 over -> "-115:-105"). */
export function getOddsBucket(overOdds: number | undefined, underOdds: number | undefined, side: "over" | "under"): string | null {
  const raw = oddsForSide(overOdds, underOdds, side);
  if (raw === undefined || raw === null || !Number.isFinite(raw)) return null;
  const american = Math.round(raw);
  if (american > 0) {
    for (const b of PLUS_BUCKETS) {
      if (american >= b.min && american <= b.max) return b.label;
    }
    return "+250:+";
  }
  for (const b of NEG_BUCKETS) {
    if (american >= b.low && american <= b.high) return b.label;
  }
  return "-999:-200";
}
