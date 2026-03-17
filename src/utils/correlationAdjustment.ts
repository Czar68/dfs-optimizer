import fs from "fs";
import path from "path";

import { getDataPath } from "../constants/paths";
import type { CardEvResult, EvPick } from "../types";

type StatKey = string;
type CorrKey = string;

interface CorrEntry {
  statA: StatKey;
  statB: StatKey;
  value: number;
}

let corrCache: Map<CorrKey, number> | null = null;

function normalizeStat(stat: string): StatKey {
  return stat.trim().toLowerCase();
}

// Canonical stat names so 3PT/3PTM/3PM, STEALS/STL, BLOCKS/BLK, FANTASY map for matrix lookup
const CANONICAL_STAT: Record<string, StatKey> = {
  points: "points", pts: "points",
  rebounds: "rebounds", reb: "rebounds", rebs: "rebounds",
  assists: "assists", ast: "assists", asts: "assists",
  threes: "threes", "3pm": "threes", "3pt": "threes", "3ptm": "threes",
  steals: "steals", stl: "steals",
  blocks: "blocks", blk: "blocks",
  turnovers: "turnovers", to: "turnovers", tov: "turnovers",
  pra: "pra", points_rebounds_assists: "pra",
  points_rebounds: "points_rebounds", pr: "points_rebounds",
  points_assists: "points_assists", pa: "points_assists",
  rebounds_assists: "rebounds_assists", ra: "rebounds_assists",
  stocks: "stocks", fantasy_score: "fantasy_score", fantasy: "fantasy_score",
};

function canonicalStat(stat: string): StatKey {
  const n = normalizeStat(stat);
  return CANONICAL_STAT[n] ?? n;
}

function makeKey(a: StatKey, b: StatKey): CorrKey {
  return `${a}__${b}`;
}

function loadCorrelationMatrix(): Map<CorrKey, number> {
  if (corrCache) return corrCache;

  const out = new Map<CorrKey, number>();

  const matrixPath = getDataPath(path.join("models", "prop_correlation_matrix.csv"));
  if (!fs.existsSync(matrixPath)) {
    // No matrix yet — treat as zero-correlation.
    corrCache = out;
    return out;
  }

  const raw = fs.readFileSync(matrixPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length <= 1) {
    corrCache = out;
    return out;
  }

  // Expect header: stat_a,stat_b,correlation,samples
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    // Very small, custom CSV parser for our simple schema.
    // Handles quoted stat fields and numeric correlation.
    const match = line.match(/^"([^"]*)","([^"]*)",([^,]+),/);
    if (!match) continue;

    const statA = canonicalStat(match[1]);
    const statB = canonicalStat(match[2]);
    const corr = Number.parseFloat(match[3]);
    if (!Number.isFinite(corr)) continue;

    const clamped = Math.max(-1, Math.min(1, corr));
    const keyAB = makeKey(statA, statB);
    const keyBA = makeKey(statB, statA);

    // If duplicates exist, keep the strongest absolute correlation.
    const existingAB = out.get(keyAB);
    if (existingAB == null || Math.abs(clamped) > Math.abs(existingAB)) {
      out.set(keyAB, clamped);
    }
    const existingBA = out.get(keyBA);
    if (existingBA == null || Math.abs(clamped) > Math.abs(existingBA)) {
      out.set(keyBA, clamped);
    }
  }

  corrCache = out;
  return out;
}

export function getStatCorrelation(statA: string, statB: string): number {
  const a = canonicalStat(statA);
  const b = canonicalStat(statB);
  if (!a || !b) return 0;
  const map = loadCorrelationMatrix();
  const key = makeKey(a, b);
  const value = map.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeCardCorrelation(card: CardEvResult): number {
  const legs = card.legs.map((l) => l.pick);
  return computeAverageCorrelationForLegs(legs);
}

export function computeAverageCorrelationForLegs(legs: EvPick[]): number {
  const n = legs.length;
  if (n < 2) return 0;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const statA = String(legs[i].stat ?? "");
      const statB = String(legs[j].stat ?? "");
      if (!statA || !statB) continue;
      const rho = getStatCorrelation(statA, statB);
      sum += rho;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const avg = sum / count;

  // Clamp to requested range.
  return Math.max(-0.4, Math.min(0.4, avg));
}

export function applyCorrelationAdjustmentToLegs(
  legs: EvPick[]
): { adjustedLegs: EvPick[]; avgCorrelation: number } {
  const avgCorrelation = computeAverageCorrelationForLegs(legs);
  const adjustment = avgCorrelation * 0.25;

  const adjustedLegs = legs.map((leg) => {
    const baseProb = leg.trueProb;
    const base = Number.isFinite(baseProb) ? baseProb : 0.5;
    let adjustedProb = base + adjustment;
    if (!Number.isFinite(adjustedProb)) adjustedProb = base;

    // Clamp to [0.02, 0.98] as specified.
    adjustedProb = Math.max(0.02, Math.min(0.98, adjustedProb));

    return {
      ...leg,
      // Store adjustedProb explicitly for diagnostics.
      adjustedProb,
      // For downstream DP / EV engines that only see trueProb, use adjustedProb.
      trueProb: adjustedProb,
    };
  });

  return { adjustedLegs, avgCorrelation };
}

