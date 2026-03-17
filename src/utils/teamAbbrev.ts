/**
 * Map NBA team full names (or variations) to 3-letter abbreviations.
 * Used for dashboard bubbles "BOS @ MIA" and legs CSV team/opponent columns.
 * Handles OddsAPI-style names ("Boston Celtics", "Miami Heat") and common variants.
 */

const ABBREV_SET = new Set<string>([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL",
  "NYK", "ORL", "PHI", "TOR", "WAS",
  "DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN", "NOP", "OKC",
  "PHX", "POR", "SAC", "SAS", "UTA",
]);

/** Normalize for lookup: lowercase, collapse spaces. */
function norm(s: string): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const FULL_TO_ABBREV: Record<string, string> = {
  "atlanta hawks": "ATL",
  "boston celtics": "BOS",
  "brooklyn nets": "BKN",
  "charlotte hornets": "CHA",
  "chicago bulls": "CHI",
  "cleveland cavaliers": "CLE",
  "detroit pistons": "DET",
  "indiana pacers": "IND",
  "miami heat": "MIA",
  "milwaukee bucks": "MIL",
  "new york knicks": "NYK",
  "orlando magic": "ORL",
  "philadelphia 76ers": "PHI",
  "philadelphia sixers": "PHI",
  "toronto raptors": "TOR",
  "washington wizards": "WAS",
  "dallas mavericks": "DAL",
  "denver nuggets": "DEN",
  "golden state warriors": "GSW",
  "houston rockets": "HOU",
  "los angeles clippers": "LAC",
  "la clippers": "LAC",
  "los angeles lakers": "LAL",
  "la lakers": "LAL",
  "memphis grizzlies": "MEM",
  "minnesota timberwolves": "MIN",
  "new orleans pelicans": "NOP",
  "oklahoma city thunder": "OKC",
  "phoenix suns": "PHX",
  "portland trail blazers": "POR",
  "portland blazers": "POR",
  "sacramento kings": "SAC",
  "san antonio spurs": "SAS",
  "utah jazz": "UTA",
};

/**
 * Return 3-letter NBA abbreviation for the given team name.
 * - If input is already a known abbrev (e.g. "BOS"), return as-is.
 * - If input is a full name or variant ("Boston Celtics", "LA Lakers"), return abbrev.
 * - Otherwise return first 3 chars uppercased (fallback).
 */
export function teamToAbbrev(name: string | null | undefined): string {
  if (name == null || String(name).trim() === "") return "";
  const s = String(name).trim();
  const upper = s.toUpperCase();
  if (s.length <= 4 && ABBREV_SET.has(upper)) return upper;
  const n = norm(s);
  if (FULL_TO_ABBREV[n]) return FULL_TO_ABBREV[n];
  // LA / Los Angeles variants
  if (n === "la clippers" || n.startsWith("la clippers")) return "LAC";
  if (n === "la lakers" || n.startsWith("la lakers")) return "LAL";
  if (n.includes("clippers")) return "LAC";
  if (n.includes("lakers")) return "LAL";
  return s.length >= 3 ? s.slice(0, 3).toUpperCase() : s.toUpperCase();
}
