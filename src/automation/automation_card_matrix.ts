/**
 * Automation card matrix export.
 * One row per canonical structure (28 PP + UD), safe for Kelly/promo wiring.
 * Data from parlay_structures.ts (canonical), binomial_breakeven, and latest cards/tier CSVs.
 */

import fs from "fs";
import path from "path";
import { ALL_STRUCTURES } from "../config/parlay_structures";
import { BREAKEVEN_TABLE_ROWS } from "../config/binomial_breakeven";
import {
  getOutputPath,
  getArtifactsPath,
  OUTPUT_DIR,
  TIER1_CSV,
  TIER2_CSV,
} from "../constants/paths";

/** Canonical row for spreadsheet ingestion. */
export interface AutomationCardMatrixRow {
  platform: string;
  flexType: string;
  structureId: string;
  legs: number;
  stake: number;
  EV: number;
  EV$: number;
  winProb: number;
  payoutVar: number;
  breakevenPct: number;
  breakevenOdds: number;
  selectedForWager: boolean;
  kellyStake: number;
  promoMultiplier: number;
  promoNotes: string;
}

/** Internal row before formatting (raw numbers). */
export interface AutomationCardMatrixRowRaw {
  platform: string;
  flexType: string;
  structureId: string;
  legs: number;
  stake: number;
  EV: number | null;
  EV$: number | null;
  winProb: number | null;
  payoutVar: number | null;
  breakevenPct: number | null;
  breakevenOdds: number | null;
  selectedForWager: boolean;
  kellyStake: number;
  promoMultiplier: number;
  promoNotes: string;
}

export interface AutomationCardMatrixAudit {
  generatedAt: string;
  totalCanonicalStructures: number;
  exportedRowCount: number;
  selectedForWagerCount: number;
  missingMonteCarloStructures: string[];
  missingBreakevenStructures: string[];
  duplicateStructureMatches: string[];
  flexTypeMismatches: string[];
  selectedForWagerRule: string;
}

const STAKE_DEFAULT = 1;
const KELLY_STAKE_DEFAULT = 0;
const PROMO_MULTIPLIER_DEFAULT = 0;
const PROMO_NOTES_DEFAULT = "";

/**
 * Selected-for-wager rule (deterministic):
 * - PP: structure is selected if tier1.csv or tier2.csv contains at least one row with site=PP and flexType equal to structureId.
 * - UD: structure is selected if underdog-cards.csv contains at least one row with flexType equal to structureId (no separate UD tier files).
 */
export const SELECTED_FOR_WAGER_RULE =
  "PP: selected if tier1.csv or tier2.csv has a row with site=PP and flexType=structureId. UD: selected if underdog-cards.csv has at least one row with flexType=structureId.";

function parseCsvWithHeaders(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function readSelectedStructureIds(
  outputDir: string
): { pp: Set<string>; ud: Set<string> } {
  const pp = new Set<string>();
  const ud = new Set<string>();
  const tier1Path = path.join(outputDir, TIER1_CSV);
  const tier2Path = path.join(outputDir, TIER2_CSV);
  for (const filePath of [tier1Path, tier2Path]) {
    const rows = parseCsvWithHeaders(filePath);
    for (const r of rows) {
      const site = (r.site ?? "").trim().toUpperCase();
      const flexType = (r.flexType ?? "").trim();
      if (site === "PP" && flexType) pp.add(flexType);
      if (site === "UD" && flexType) ud.add(flexType);
    }
  }
  const udCardsPath = path.join(outputDir, "underdog-cards.csv");
  const udCards = parseCsvWithHeaders(udCardsPath);
  for (const r of udCards) {
    const ft = (r.flexType ?? "").trim();
    if (ft) ud.add(ft);
  }
  return { pp, ud };
}

function loadCardsFromJson<T = { flexType?: string; cardEv?: number; kellyResult?: { recommendedStake?: number }; monteCarloEV?: number; monteCarloWinProb?: number; metrics?: { varianceScore?: number } }>(
  filePath: string
): T[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as { cards?: T[] };
    return Array.isArray(data.cards) ? data.cards : [];
  } catch {
    return [];
  }
}

/** Build a map structureId -> best (first by cardEv desc) card for EV/kelly/Monte Carlo. */
function buildStructureCardMap(
  cards: { flexType?: string; structureId?: string; cardEv?: number; kellyResult?: { recommendedStake?: number }; monteCarloEV?: number; monteCarloWinProb?: number; metrics?: { varianceScore?: number } }[],
  platform: "PP" | "UD"
): Map<string, typeof cards[0]> {
  const byStruct = new Map<string, typeof cards[0]>();
  const sorted = [...cards].filter((c) => (c.flexType ?? c.structureId) != null).sort((a, b) => (b.cardEv ?? 0) - (a.cardEv ?? 0));
  for (const c of sorted) {
    const id = (c.structureId ?? c.flexType ?? "").trim();
    if (!id || byStruct.has(id)) continue;
    byStruct.set(id, c);
  }
  return byStruct;
}

export function buildAutomationCardMatrixRows(root: string): {
  rows: AutomationCardMatrixRowRaw[];
  audit: AutomationCardMatrixAudit;
} {
  const outputDir = path.join(root, "data", "output_logs");
  const artifactsDir = path.join(root, "artifacts");
  const ppCardsJsonPath = path.join(outputDir, "prizepicks-cards.json");
  const udCardsJsonPath = path.join(outputDir, "underdog-cards.json");

  const beByStructureId = new Map<string, { pct: number; americanOdds: number }>();
  for (const r of BREAKEVEN_TABLE_ROWS) {
    beByStructureId.set(r.structureId, {
      pct: r.breakevenPct,
      americanOdds: r.americanOdds,
    });
  }

  const selected = readSelectedStructureIds(outputDir);
  const ppCards = loadCardsFromJson(ppCardsJsonPath);
  const udCards = loadCardsFromJson(udCardsJsonPath);
  const ppMap = buildStructureCardMap(ppCards, "PP");
  const udMap = buildStructureCardMap(udCards, "UD");

  const missingMonteCarlo: string[] = [];
  const missingBreakeven: string[] = [];
  const duplicateMatches: string[] = [];
  const flexTypeMismatches: string[] = [];

  const rows: AutomationCardMatrixRowRaw[] = [];

  for (const s of ALL_STRUCTURES) {
    const structureId = s.structureId;
    const platform = s.platform;
    const flexType = structureId;
    const legs = s.size;
    const stake = STAKE_DEFAULT;
    const be = beByStructureId.get(structureId);
    if (!be) missingBreakeven.push(structureId);

    let EV: number | null = null;
    let EV$: number | null = null;
    let winProb: number | null = null;
    let payoutVar: number | null = null;
    let kellyStake = KELLY_STAKE_DEFAULT;

    const cardMap = platform === "PP" ? ppMap : udMap;
    const card = cardMap.get(structureId);
    if (card) {
      const evVal = card.cardEv;
      if (evVal != null && Number.isFinite(evVal)) {
        EV = evVal;
        EV$ = stake * evVal;
      }
      if (card.monteCarloEV != null && Number.isFinite(card.monteCarloEV)) {
        // Prefer Monte Carlo EV when present for consistency
        if (EV == null) {
          EV = card.monteCarloEV;
          EV$ = stake * card.monteCarloEV;
        }
      } else {
        missingMonteCarlo.push(structureId);
      }
      if (card.monteCarloWinProb != null && Number.isFinite(card.monteCarloWinProb)) {
        winProb = card.monteCarloWinProb;
      }
      const v = card.metrics?.varianceScore;
      if (v != null && Number.isFinite(v)) payoutVar = v;
      const ks = card.kellyResult?.recommendedStake;
      if (ks != null && Number.isFinite(ks)) kellyStake = ks;
    } else {
      missingMonteCarlo.push(structureId);
    }

    const selectedForWager =
      platform === "PP"
        ? selected.pp.has(structureId)
        : selected.ud.has(structureId);

    rows.push({
      platform,
      flexType,
      structureId,
      legs,
      stake,
      EV,
      EV$,
      winProb,
      payoutVar,
      breakevenPct: be?.pct ?? null,
      breakevenOdds: be?.americanOdds ?? null,
      selectedForWager,
      kellyStake,
      promoMultiplier: PROMO_MULTIPLIER_DEFAULT,
      promoNotes: PROMO_NOTES_DEFAULT,
    });
  }

  const selectedForWagerCount = rows.filter((r) => r.selectedForWager).length;
  const audit: AutomationCardMatrixAudit = {
    generatedAt: new Date().toISOString(),
    totalCanonicalStructures: ALL_STRUCTURES.length,
    exportedRowCount: rows.length,
    selectedForWagerCount,
    missingMonteCarloStructures: [...new Set(missingMonteCarlo)].sort(),
    missingBreakevenStructures: [...new Set(missingBreakeven)].sort(),
    duplicateStructureMatches: duplicateMatches,
    flexTypeMismatches: flexTypeMismatches,
    selectedForWagerRule: SELECTED_FOR_WAGER_RULE,
  };

  return { rows, audit };
}

function formatRowForCsv(r: AutomationCardMatrixRowRaw): AutomationCardMatrixRow {
  return {
    platform: r.platform,
    flexType: r.flexType,
    structureId: r.structureId,
    legs: r.legs,
    stake: r.stake,
    EV: r.EV ?? 0,
    EV$: r.EV$ ?? 0,
    winProb: r.winProb ?? 0,
    payoutVar: r.payoutVar ?? 0,
    breakevenPct: r.breakevenPct ?? 0,
    breakevenOdds: r.breakevenOdds ?? 0,
    selectedForWager: r.selectedForWager,
    kellyStake: r.kellyStake,
    promoMultiplier: r.promoMultiplier,
    promoNotes: r.promoNotes,
  };
}

/** Required CSV column order for automation-card-matrix (spreadsheet contract). */
export const AUTOMATION_CARD_MATRIX_CSV_HEADERS = [
  "platform",
  "flexType",
  "structureId",
  "legs",
  "stake",
  "EV",
  "EV$",
  "winProb",
  "payoutVar",
  "breakeven%",
  "breakevenOdds",
  "selectedForWager",
  "kellyStake",
  "promoMultiplier",
  "promoNotes",
] as const;

const CSV_HEADERS = [...AUTOMATION_CARD_MATRIX_CSV_HEADERS];

function toCsvValue(row: AutomationCardMatrixRow, key: keyof AutomationCardMatrixRow): string {
  const v = row[key];
  if (typeof v === "number") {
    if (key === "breakevenPct") return `${v.toFixed(2)}%`;
    return v.toFixed(2);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v ?? "");
}

export function writeAutomationCardMatrix(root: string): {
  csvPath: string;
  jsonPath: string;
  auditPath: string;
  rowCount: number;
  audit: AutomationCardMatrixAudit;
} {
  const outputDir = path.join(root, OUTPUT_DIR);
  const artifactsDir = path.join(root, "artifacts");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

  const { rows: rawRows, audit } = buildAutomationCardMatrixRows(root);
  const rows = rawRows.map(formatRowForCsv);

  const csvPath = getOutputPath("automation-card-matrix.csv", root);
  const csvLines = [
    CSV_HEADERS.join(","),
    ...rows.map((r) =>
      CSV_HEADERS.map((h) => {
        const key = h === "breakeven%" ? "breakevenPct" : h;
        const val = toCsvValue(r, key as keyof AutomationCardMatrixRow);
        return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(",")
    ),
  ];
  fs.writeFileSync(csvPath, csvLines.join("\n"), "utf8");

  const jsonPath = getArtifactsPath("automation-card-matrix.json", root);
  const jsonPayload = {
    generatedAt: audit.generatedAt,
    totalStructures: audit.totalCanonicalStructures,
    rows: rows.map((r) => ({
      ...r,
      breakevenPct: `${r.breakevenPct.toFixed(2)}%`,
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");

  const auditPath = getArtifactsPath("automation-card-matrix-audit.json", root);
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf8");

  return { csvPath, jsonPath, auditPath, rowCount: rows.length, audit };
}
