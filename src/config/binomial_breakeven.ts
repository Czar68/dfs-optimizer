// src/config/binomial_breakeven.ts
// Breakeven p* from math only: ER(p) = Σ C(n,k) p^k (1-p)^{n-k} payout[k], EV(p)=ER(p)-1, solve EV(p*)=0.
// Autobracket: scan p in [0.01, 0.99] for sign change; throw if invalid schedule.
// Single canonical payout source: parlay_structures.ts

import { ALL_STRUCTURES, type StructureDef } from "./parlay_structures";

/** Binomial coefficient C(n, k) */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) {
    c = (c * (n - i)) / (i + 1);
  }
  return c;
}

/** PMF P(X = k) for X ~ Bin(n, p) */
function binomPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return binom(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Expected return per unit staked (i.i.d. legs each with prob p).
 * ER(p) = Σ_{k=0..n} C(n,k) p^k (1-p)^{n-k} * payoutByHits[k]
 * EV(p) = ER(p) - 1
 */
export function expectedReturnBinomial(
  n: number,
  payoutByHits: Record<number, number>,
  p: number
): number {
  let er = 0;
  for (let k = 0; k <= n; k++) {
    const mult = payoutByHits[k] ?? 0;
    er += binomPmf(k, n, p) * mult;
  }
  return er - 1;
}

/**
 * Autobracket: scan p from pMin to pMax in steps to find [pLo, pHi] where EV changes sign.
 * Throws if no sign change (invalid payout schedule).
 */
function findBracket(
  n: number,
  payoutByHits: Record<number, number>,
  pMin: number = 0.01,
  pMax: number = 0.99,
  step: number = 0.01
): { pLo: number; pHi: number } {
  let evPrev = expectedReturnBinomial(n, payoutByHits, pMin);
  for (let p = pMin + step; p <= pMax; p += step) {
    const ev = expectedReturnBinomial(n, payoutByHits, p);
    if (evPrev * ev <= 0 && evPrev !== ev) {
      const pLo = p - step;
      return { pLo, pHi: p };
    }
    evPrev = ev;
  }
  throw new Error(
    `Breakeven autobracket failed: no sign change for structure n=${n} in [${pMin}, ${pMax}]. ` +
      `Payout schedule may be invalid. EV at ${pMin}=${expectedReturnBinomial(n, payoutByHits, pMin)}, at ${pMax}=${evPrev}.`
  );
}

/**
 * Solve for p* where EV(p*)=0. Uses autobracket then bisection.
 * No hardcoded bracket — derives from payout math.
 */
export function solveBreakevenProbability(
  n: number,
  payoutByHits: Record<number, number>,
  maxIter: number = 80,
  tol: number = 1e-8
): number {
  const { pLo, pHi } = findBracket(n, payoutByHits);
  let lo = pLo;
  let hi = pHi;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const evMid = expectedReturnBinomial(n, payoutByHits, mid);
    if (Math.abs(evMid) < tol) return mid;
    if (evMid < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * American odds from probability q (0<q<1).
 * q >= 0.5: American = -100*q/(1-q)
 * q < 0.5:  American = 100*(1-q)/q
 */
export function probToAmerican(q: number): number {
  if (q <= 0 || q >= 1) return 0;
  if (q >= 0.5) return (-100 * q) / (1 - q);
  return (100 * (1 - q)) / q;
}

export interface BreakevenRow {
  platform: "PP" | "UD";
  size: number;
  type: string;
  structureId: string;
  payoutByHits: Record<number, number>;
  breakevenPct: number;
  americanOdds: number;
}

function buildTable(): BreakevenRow[] {
  const rows: BreakevenRow[] = [];
  for (const s of ALL_STRUCTURES) {
    const p = solveBreakevenProbability(s.size, s.payoutByHits);
    const typeLabel =
      s.type === "Flex"
        ? s.size <= 5
          ? "Flex-1loss"
          : "Flex-2loss"
        : s.type;
    rows.push({
      platform: s.platform,
      size: s.size,
      type: typeLabel,
      structureId: s.structureId,
      payoutByHits: { ...s.payoutByHits },
      breakevenPct: p * 100,
      americanOdds: Math.round(probToAmerican(p)),
    });
  }
  return rows;
}

export const BREAKEVEN_TABLE_ROWS = buildTable();

const BE_MAP = new Map<string, number>();
for (const r of BREAKEVEN_TABLE_ROWS) {
  BE_MAP.set(r.structureId, r.breakevenPct / 100);
  if (r.platform === "PP") {
    if (r.type === "Power") BE_MAP.set(`${r.size}P`, r.breakevenPct / 100);
    if (r.type.startsWith("Flex")) BE_MAP.set(`${r.size}F`, r.breakevenPct / 100);
  }
}

export function getBreakevenForStructure(structureId: string): number {
  const id = structureId.replace(/\s/g, "").toUpperCase();
  return BE_MAP.get(id) ?? BE_MAP.get(structureId) ?? 0.5;
}

export function legClearsBreakevenForStructure(
  trueProb: number,
  structureId: string,
  edgeMin: number = 0
): boolean {
  const be = getBreakevenForStructure(structureId);
  return trueProb >= be + edgeMin;
}

export function formatPayouts(payoutByHits: Record<number, number>): string {
  return Object.entries(payoutByHits)
    .filter(([, m]) => m > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([k, m]) => `${k}:${m}`)
    .join(", ");
}

/** Markdown table: Platform | StructureId | Size n | Type | Payout schedule | BE p* (%) | BE American */
export function breakevenTableMarkdown(): string {
  const lines: string[] = [
    "# Parlay Breakeven Table (Binomial-Derived)",
    "",
    "Per-leg breakeven p* where EV(p*)=0. All values from solver; payout schedules from parlay_structures.ts.",
    "",
    "| Platform | StructureId | Size n | Type | Payout schedule (hits→mult) | Breakeven p* (%) | Breakeven American odds |",
    "|----------|-------------|--------|------|-----------------------------|------------------|--------------------------|",
  ];
  for (const r of BREAKEVEN_TABLE_ROWS) {
    const payStr = formatPayouts(r.payoutByHits);
    lines.push(
      `| ${r.platform} | ${r.structureId} | ${r.size} | ${r.type} | ${payStr} | ${r.breakevenPct.toFixed(2)}% | ${r.americanOdds} |`
    );
  }
  lines.push("");
  lines.push("## Validation");
  lines.push("- UD 2-pick Standard (3.5×): BE ≈ 53.45%, American ≈ -115.");
  lines.push("- PP 6-pick Flex (25×/2×/0.4×): BE ≈ 54.21%, American ≈ -118.6.");
  return lines.join("\n");
}

/**
 * Heatmap/matrix HTML: rows = structures, columns = BE %, American odds.
 * Shows BE differs across platform/type/size (not a line chart).
 */
export function breakevenHeatmapHtml(): string {
  const rows = BREAKEVEN_TABLE_ROWS;
  const minBe = Math.min(...rows.map((r) => r.breakevenPct));
  const maxBe = Math.max(...rows.map((r) => r.breakevenPct));
  const scale = (pct: number) => {
    const t = (pct - minBe) / (maxBe - minBe || 1);
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * t);
    return `rgb(${r},${g},200)`;
  };
  const html = [
    "<!DOCTYPE html>",
    "<html><head><meta charset='utf-8'><title>Parlay Breakeven Matrix</title>",
    "<style>",
    "body { font-family: system-ui; margin: 20px; }",
    "h1 { font-size: 1.2rem; }",
    "table { border-collapse: collapse; }",
    "th, td { border: 1px solid #333; padding: 6px 10px; text-align: right; }",
    "th { background: #eee; }",
    "td.be { font-weight: 600; }",
    "</style></head><body>",
    "<h1>Parlay Breakeven by Structure (BE % and American Odds)</h1>",
    "<p>Each row = one structure. BE % and odds derived from full payout schedule (binomial solver).</p>",
    "<table>",
    "<thead><tr><th>Platform</th><th>StructureId</th><th>Size n</th><th>Type</th><th>BE %</th><th>American</th></tr></thead>",
    "<tbody>",
  ];
  for (const r of rows) {
    const bg = scale(r.breakevenPct);
    html.push(
      `<tr><td>${r.platform}</td><td>${r.structureId}</td><td>${r.size}</td><td>${r.type}</td>` +
        `<td class="be" style="background:${bg}">${r.breakevenPct.toFixed(2)}%</td><td>${r.americanOdds}</td></tr>`
    );
  }
  html.push("</tbody></table></body></html>");
  return html.join("\n");
}
