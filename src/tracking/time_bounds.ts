/**
 * Deterministic reporting boundaries in America/New_York (NBA slate).
 * Used for day / week / month / year rollups on tracker card timestamps (ISO).
 */

const TZ = "America/New_York";

/** YYYY-MM-DD in ET for an instant */
export function dateKeyEt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM in ET */
export function monthKeyEt(iso: string): string {
  const dk = dateKeyEt(iso);
  if (dk.length < 7) return "";
  return dk.slice(0, 7);
}

/** YYYY in ET */
export function yearKeyEt(iso: string): string {
  const dk = dateKeyEt(iso);
  if (dk.length < 4) return "";
  return dk.slice(0, 4);
}

/**
 * Monday UTC date YYYY-MM-DD for the week containing `iso` (week bucket id).
 * Deterministic; day=0 Sun → roll back to prior Monday in UTC.
 */
export function weekKeyUtcMonday(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

export type ReportingPeriod = "day" | "week" | "month" | "year" | "lifetime";

export function cardInPeriod(
  cardTimestampIso: string,
  period: ReportingPeriod,
  anchor: Date
): boolean {
  if (period === "lifetime") return true;
  const cardDk = dateKeyEt(cardTimestampIso);
  if (!cardDk) return false;
  const anchorDk = dateKeyEt(anchor.toISOString());
  if (!anchorDk) return false;

  if (period === "day") return cardDk === anchorDk;
  if (period === "month") return monthKeyEt(cardTimestampIso) === monthKeyEt(anchor.toISOString());
  if (period === "year") return yearKeyEt(cardTimestampIso) === yearKeyEt(anchor.toISOString());
  if (period === "week") return weekKeyUtcMonday(cardTimestampIso) === weekKeyUtcMonday(anchor.toISOString());
  return false;
}
