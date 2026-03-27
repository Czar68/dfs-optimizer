// src/calculate_overs_delta_ev.ts
//
// Overs Delta EV Detector (Phase 2 PP v4)
//
// MODEL: Poisson-normal approximation
//   X ~ Normal(μ, σ) where σ = √μ (Poisson-like variance = mean)
//
// GIVEN: PP pick at line L₀ with devigged over probability p₀ (from main internal odds line)
// INFER: μ by solving  P(X > L₀) = p₀
//        → (L₀ - μ)/√μ = Φ⁻¹(1 - p₀) = z₀
//        → u² + z₀·u - L₀ = 0 where u = √μ
//        → μ = ((-z₀ + √(z₀² + 4·L₀)) / 2)²
//
// THEN: for each alt line L₁ (isMainLine === false, same player+stat):
//        est_prob  = P(X > L₁) = 1 - Φ((L₁ - μ)/√μ)
//        break_even = implied probability from alt over odds
//        delta_ev  = est_prob - break_even
//        FLAG if delta_ev > 0 (overs-only bias — no gap cap)
//
// USAGE (from run_optimizer.ts):
//   import { calculateOversEV, writeOversEVReport } from "./calculate_overs_delta_ev";
//   const deltaLegs = calculateOversEV(mergedPicks, sgoMarkets);
//   writeOversEVReport(deltaLegs);

import fs from "fs";
import path from "path";
import { MergedPick, InternalPlayerPropOdds } from "./types";

// ─── Normal distribution utilities ────────────────────────────────────────────

/**
 * Cumulative standard normal distribution Φ(x).
 * Abramowitz & Stegun 26.2.17 — max error < 7.5e-8.
 */
function normalCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/**
 * Inverse standard normal (probit) Φ⁻¹(p).
 * Peter Acklam's rational approximation — max relative error < 1.15e-9.
 */
function probit(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
     1.383577518672690e2, -3.066479806614716e1,  2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
     6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734,     4.374664141464968,     2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996,    3.754408661907416,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ─── Poisson-normal model ──────────────────────────────────────────────────────

/**
 * Infer the player mean μ from P(X > line) = prob under Normal(μ, √μ).
 * Returns NaN if the model cannot converge (very high or very low prob).
 */
function inferMu(line: number, overProb: number): number {
  // Clamp to avoid degenerate probit values
  const p = Math.max(0.01, Math.min(0.99, overProb));
  const z0 = probit(1 - p); // z₀ = Φ⁻¹(1-p)

  // Quadratic: u² + z₀·u - line = 0, u = √μ
  const disc = z0 * z0 + 4 * line;
  if (disc < 0 || line <= 0) return NaN;
  const u = (-z0 + Math.sqrt(disc)) / 2;
  if (u <= 0) return NaN;
  return u * u;
}

/**
 * P(X > altLine) under Normal(μ, √μ).
 */
function estOverProb(mu: number, altLine: number): number {
  if (!isFinite(mu) || mu <= 0) return NaN;
  const sigma = Math.sqrt(mu);
  return 1 - normalCdf((altLine - mu) / sigma);
}

// ─── Odds math ─────────────────────────────────────────────────────────────────

function americanToBreakEven(american: number): number {
  if (!isFinite(american)) return NaN;
  if (american < 0) return Math.abs(american) / (Math.abs(american) + 100);
  return 100 / (american + 100);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OversEVLeg {
  player: string;
  sport: string;
  league: string;
  stat: string;
  ppLine: number;
  ppProb: number;
  estMu: number;
  sgoAltLine: number;
  sgoAltOdds: number;
  sgoAltBook: string;
  breakEven: number;
  estProb: number;
  deltaEv: number;
  /** OVER_SHIFT = modest edge; OVER_SHIFT++ = strong edge (>5%) */
  shiftFlag: string;
}

// ─── Name normalization (mirrors merge_odds.ts) ────────────────────────────────

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function stripSuffix(s: string): string {
  return s.replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, "").trim();
}
function normPlayerForMatch(name: string): string {
  return stripSuffix(stripAccents(normalizeName(name)));
}
function normSgoId(id: string): string {
  const parts = id.split("_");
  if (parts.length <= 2) return normalizeName(id);
  return normalizeName(parts.slice(0, -2).join(" "));
}

// ─── Core calculator ───────────────────────────────────────────────────────────

/**
 * For each PP merged pick, find all alt lines for the same player+stat
 * and compute Overs Delta EV using the Poisson-normal model.
 *
 * @param mergedPicks  Merged PP picks with trueProb already computed
 * @param sgoMarkets   Full internal market list including alt lines
 * @param minDeltaEv   Minimum delta EV to include (default: any positive = 0)
 */
export function calculateOversEV(
  mergedPicks: MergedPick[],
  sgoMarkets: InternalPlayerPropOdds[],
  minDeltaEv = 0
): OversEVLeg[] {
  const legs: OversEVLeg[] = [];

  for (const pick of mergedPicks) {
    const mu = inferMu(pick.line, pick.trueProb);
    if (!isFinite(mu) || mu <= 0) continue;

    const targetName = normPlayerForMatch(pick.player);

    // Find all alt lines for this player+stat from SGO
    const altLines = sgoMarkets.filter((o) => {
      if (o.isMainLine !== false) return false; // only confirmed alt lines
      const sgoName = normPlayerForMatch(normSgoId(o.player));
      return (
        sgoName === targetName &&
        o.stat === pick.stat &&
        o.sport === pick.sport &&
        o.league.toUpperCase() === pick.league.toUpperCase() &&
        o.line > pick.line // overs-only: only consider lines higher than PP line
      );
    });

    for (const alt of altLines) {
      if (!isFinite(alt.overOdds)) continue;

      const be = americanToBreakEven(alt.overOdds);
      const est = estOverProb(mu, alt.line);

      if (!isFinite(be) || !isFinite(est)) continue;

      const deltaEv = est - be;
      if (deltaEv < minDeltaEv) continue;

      const shiftFlag =
        deltaEv >= 0.08 ? "OVER_SHIFT+++" :
        deltaEv >= 0.05 ? "OVER_SHIFT++" :
        deltaEv >= 0.02 ? "OVER_SHIFT+" :
        "OVER_SHIFT";

      legs.push({
        player: pick.player,
        sport: pick.sport,
        league: pick.league,
        stat: pick.stat,
        ppLine: pick.line,
        ppProb: pick.trueProb,
        estMu: Math.round(mu * 10) / 10,
        sgoAltLine: alt.line,
        sgoAltOdds: alt.overOdds,
        sgoAltBook: alt.book,
        breakEven: Math.round(be * 10000) / 10000,
        estProb: Math.round(est * 10000) / 10000,
        deltaEv: Math.round(deltaEv * 10000) / 10000,
        shiftFlag,
      });
    }
  }

  // Sort by deltaEv descending
  return legs.sort((a, b) => b.deltaEv - a.deltaEv);
}

// ─── CSV writer ────────────────────────────────────────────────────────────────

/** Write OversEVLeg[] to CSV and print top 10 to console. */
export function writeOversEVReport(legs: OversEVLeg[], outPath?: string): void {
  const root = process.cwd();
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filePath = outPath ?? path.join(root, `pp_overs_delta_ev_${ts}.csv`);
  const rolling = path.join(root, "pp_overs_delta_ev.csv");

  const headers = [
    "player", "sport", "league", "stat",
    "pp_line", "pp_prob",  "est_mu",
    "sgo_alt_line", "sgo_alt_odds", "sgo_alt_book",
    "break_even", "est_prob", "delta_ev", "shift_flag",
  ];

  const rows = legs.map((l) => [
    l.player, l.sport, l.league, l.stat,
    l.ppLine, l.ppProb.toFixed(4), l.estMu,
    l.sgoAltLine, l.sgoAltOdds, l.sgoAltBook,
    l.breakEven.toFixed(4), l.estProb.toFixed(4),
    l.deltaEv.toFixed(4), l.shiftFlag,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  fs.writeFileSync(filePath, csv, "utf8");
  fs.writeFileSync(rolling, csv, "utf8");

  console.log(`\n[Overs Delta EV] ${legs.length} +EV over legs → ${filePath}`);

  if (legs.length === 0) {
    console.log("[Overs Delta EV] No +EV alt overs found for this slate.");
    return;
  }

  // Top 10 console table
  console.log("\n[Overs Delta EV] Top 10 alt overs opportunities:");
  console.log(
    "player".padEnd(26) + " | " +
    "stat".padEnd(10) + " | " +
    "PP line".padEnd(8) + " | " +
    "SGO alt".padEnd(8) + " | " +
    "odds".padEnd(7) + " | " +
    "book".padEnd(10) + " | " +
    "estP".padEnd(7) + " | " +
    "BE".padEnd(7) + " | " +
    "ΔEV".padEnd(7) + " | flag"
  );
  console.log("-".repeat(120));

  for (const l of legs.slice(0, 10)) {
    console.log(
      l.player.padEnd(26) + " | " +
      l.stat.padEnd(10) + " | " +
      String(l.ppLine).padEnd(8) + " | " +
      String(l.sgoAltLine).padEnd(8) + " | " +
      String(l.sgoAltOdds).padEnd(7) + " | " +
      l.sgoAltBook.padEnd(10) + " | " +
      (l.estProb * 100).toFixed(1).padEnd(6) + "% | " +
      (l.breakEven * 100).toFixed(1).padEnd(6) + "% | " +
      ("+" + (l.deltaEv * 100).toFixed(2) + "%").padEnd(7) + " | " +
      l.shiftFlag
    );
  }
}

// ─── Cache loader (shared with run_sgo_only.ts) ───────────────────────────────

const CACHE_DIR = path.join(process.cwd(), "cache");
const RAW_CACHE_PATTERN = /^(nba|nfl|nhl|mlb)_sgo_props_cache\.json$/i;

export function loadSgoMarketsFromCache(): InternalPlayerPropOdds[] {
  if (!fs.existsSync(CACHE_DIR)) return [];
  const markets: InternalPlayerPropOdds[] = [];
  const files = fs.readdirSync(CACHE_DIR).filter((f) => RAW_CACHE_PATTERN.test(f));
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8"));
      markets.push(...(raw.data as InternalPlayerPropOdds[]));
    } catch { /* skip bad cache */ }
  }
  return markets;
}
