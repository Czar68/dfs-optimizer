/**
 * Phase 75 — PP merge breadth: fixture/diagnostic report (JSON + Markdown).
 */

import fs from "fs";
import path from "path";
import {
  mapJsonToRawPicks,
  mapPrizePicksStatType,
  resolvePrizePicksStatTypeRaw,
  type PrizePicksProjectionsResponse,
} from "../fetch_props";

const SCHEMA_VERSION = 1;

function countCsvLegRows(root: string): number | null {
  const p = path.join(root, "prizepicks-legs.csv");
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8").trim();
  if (!text.length) return 0;
  const lines = text.split(/\r?\n/);
  return Math.max(0, lines.length - 1);
}

function buildStatResolutionCounts(json: PrizePicksProjectionsResponse): {
  legacyStringStatTypeOnly: number;
  fullPhase75: number;
  /** String `stat_type` present but legacy mapper returned null; Phase 75 maps (spacing collapse + explicit P+A / R+A tokens). */
  gainFromStringStatPath: number;
  /** No non-empty string `stat_type`; resolved via `stat_display_name` or `included` stat_type. */
  gainFromDisplayOrRelationship: number;
} {
  let legacyStringStatTypeOnly = 0;
  let fullPhase75 = 0;
  let gainFromStringStatPath = 0;
  let gainFromDisplayOrRelationship = 0;

  const statTypeById = new Map<string, string>();
  for (const item of json.included || []) {
    if (item.type !== "stat_type") continue;
    const attrs = item.attributes as Record<string, unknown>;
    const cand = [attrs.name, attrs.display_name, attrs.stat_display_name].find(
      (x) => typeof x === "string" && x.trim().length > 0
    ) as string | undefined;
    if (cand) statTypeById.set(item.id, cand.trim());
  }

  for (const proj of json.data) {
    const attr = proj.attributes;
    const rawFull = resolvePrizePicksStatTypeRaw(attr, proj, statTypeById);
    const statFull = rawFull ? mapPrizePicksStatType(rawFull) : null;
    if (statFull) fullPhase75++;

    const st = attr.stat_type;
    let legacy: ReturnType<typeof mapPrizePicksStatType> = null;
    if (typeof st === "string" && st.trim()) {
      legacy = mapPrizePicksStatType(st, { collapseComboSpacing: false });
    }
    if (legacy) legacyStringStatTypeOnly++;

    if (legacy || !statFull) continue;

    const hasStringStatType = typeof st === "string" && st.trim().length > 0;
    if (hasStringStatType) {
      gainFromStringStatPath++;
    } else {
      gainFromDisplayOrRelationship++;
    }
  }

  return {
    legacyStringStatTypeOnly,
    fullPhase75,
    gainFromStringStatPath,
    gainFromDisplayOrRelationship,
  };
}

export function buildPpMergeBreadthAnalysis(root: string = process.cwd()) {
  const samplePath = path.join(root, "pp_projections_sample.json");
  const hasSample = fs.existsSync(samplePath);
  let sample: PrizePicksProjectionsResponse | null = null;
  if (hasSample) {
    sample = JSON.parse(
      fs.readFileSync(samplePath, "utf8")
    ) as PrizePicksProjectionsResponse;
  }

  const rawPickCountAfter = sample ? mapJsonToRawPicks(sample).length : null;
  const resolution = sample ? buildStatResolutionCounts(sample) : null;
  const prizepicksLegCsvRows = countCsvLegRows(root);

  const changes: string[] = [
    "fetch_props: resolve stat via string stat_type, stat_display_name, or relationships.stat_type + included stat_type (id→name).",
    "mapPrizePicksStatType: NBA combo tokens match when spaces are removed around '+' (e.g. Pts + Rebs + Asts).",
    "merge_odds STAT_MAP: explicit p+a → points_assists, r+a → rebounds_assists (Odds/feed token parity).",
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    inputs: {
      ppProjectionsSamplePath: hasSample
        ? path.relative(root, samplePath).replace(/\\/g, "/")
        : null,
      prizepicksLegsCsvRowCount: prizepicksLegCsvRows,
    },
    codeChanges: changes,
    fixture: {
      rawPickCountPhase75: rawPickCountAfter,
      statResolutionProjectionCounts: resolution,
    },
    viabilityNote:
      "End-to-end PP eligible legs ≥6 and PP cards require a full optimizer run with live OddsAPI + PrizePicks; fixture counts prove mapping breadth only.",
  };
}

function writeMd(
  outDir: string,
  j: ReturnType<typeof buildPpMergeBreadthAnalysis>
): void {
  const lines: string[] = [
    "# Phase 75 — PP merge breadth analysis",
    "",
    `Generated: **${j.generatedAtUtc}**`,
    "",
    "## Code changes",
    "",
    ...j.codeChanges.map((c) => `- ${c}`),
    "",
    "## Fixture (`pp_projections_sample.json`)",
    "",
    `- **RawPick count (Phase 75 mapper):** ${j.fixture.rawPickCountPhase75 ?? "n/a"}`,
  ];
  if (j.fixture.statResolutionProjectionCounts) {
    const r = j.fixture.statResolutionProjectionCounts;
    lines.push(
      "",
      "### Projection-level stat resolution (diagnostic)",
      "",
      `- legacyStringStatTypeOnly (string stat_type, no spacing collapse): **${r.legacyStringStatTypeOnly}**`,
      `- fullPhase75 (resolve + spacing collapse): **${r.fullPhase75}**`,
      `- gainFromStringStatPath (string stat_type, legacy null → Phase 75 non-null): **${r.gainFromStringStatPath}**`,
      `- gainFromDisplayOrRelationship (non-string or missing stat_type string): **${r.gainFromDisplayOrRelationship}**`,
      ""
    );
  }
  lines.push(
    "## Live viability",
    "",
    j.viabilityNote,
    "",
    `- **prizepicks-legs.csv data rows (if present):** ${j.inputs.prizepicksLegsCsvRowCount ?? "n/a"}`,
    ""
  );
  fs.writeFileSync(path.join(outDir, "latest_pp_merge_breadth_analysis.md"), lines.join("\n"), "utf8");
}

export function main(root: string = process.cwd()): void {
  const j = buildPpMergeBreadthAnalysis(root);
  const outDir = path.join(root, "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "latest_pp_merge_breadth_analysis.json"),
    JSON.stringify(j, null, 2),
    "utf8"
  );
  writeMd(outDir, j);
  console.log(
    `Wrote data/reports/latest_pp_merge_breadth_analysis.json and .md (RawPick count=${j.fixture.rawPickCountPhase75 ?? "n/a"})`
  );
}

if (require.main === module) {
  main();
}
