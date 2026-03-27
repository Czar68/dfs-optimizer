/**
 * Phase 77 — Write `data/reports/latest_portfolio_diversification.json` + `.md` (PP / UD sections merge on `platform both`).
 */

import fs from "fs";
import path from "path";
import type { PortfolioDiversificationReport } from "../policy/portfolio_diversification";

export type PortfolioDiversificationFilePayload = {
  schemaVersion: 1;
  generatedAtUtc: string;
  pp: { enabled: boolean; report: PortfolioDiversificationReport | null } | null;
  ud: { enabled: boolean; report: PortfolioDiversificationReport | null } | null;
};

function readExistingPayload(root: string): Partial<PortfolioDiversificationFilePayload> {
  const jsonPath = path.join(root, "data", "reports", "latest_portfolio_diversification.json");
  if (!fs.existsSync(jsonPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Partial<PortfolioDiversificationFilePayload>;
  } catch {
    return {};
  }
}

function renderReportSection(
  title: string,
  block: { enabled: boolean; report: PortfolioDiversificationReport | null } | null
): string[] {
  if (!block) return [`## ${title}`, "", "_Not run._", ""];
  if (!block.enabled || !block.report) {
    return [
      `## ${title}`,
      "",
      "Diversification **disabled** or no report — export used raw EV ranking + cap slice only.",
      "",
    ];
  }
  const r = block.report;
  return [
    `## ${title}`,
    "",
    "### Policy",
    "",
    "```json",
    JSON.stringify(r.policy, null, 2),
    "```",
    "",
    "### Counts",
    "",
    `- **Candidates:** ${r.candidateCount}`,
    `- **Export cap:** ${r.exportCap}`,
    `- **Diversified exported:** ${r.diversifiedCount}`,
    `- **Greedy stopped early:** ${r.greedyStoppedEarly ? "yes" : "no"}`,
    `- **Max pairwise leg overlap:** ${r.maxPairwiseOverlapDiversified}`,
    "",
    "### Top repeated legs (raw top-K vs diversified)",
    "",
    "**Raw top-K**",
    "",
    ...r.topRepeatedLegsRawTopK.slice(0, 8).map((x) => `- \`${x.legKey}\`: ${x.count}`),
    "",
    "**Diversified**",
    "",
    ...r.topRepeatedLegsDiversified.slice(0, 8).map((x) => `- \`${x.legKey}\`: ${x.count}`),
    "",
    "### Exported cards",
    "",
    ...r.diversifiedExported.map(
      (c, i) =>
        `${i + 1}. **${c.flexType}** rawEV=${c.rawCardEv.toFixed(5)} adj=${c.diversificationAdjustedScore.toFixed(5)} pen=${c.breakdown.penaltyTotal.toFixed(5)}`
    ),
    "",
  ];
}

/**
 * Merge-updates one platform section; safe when the other platform is written in the same process (read-modify-write).
 */
export function updatePortfolioDiversificationArtifactSection(
  section: "pp" | "ud",
  report: PortfolioDiversificationReport | null,
  enabled: boolean,
  root: string = process.cwd()
): void {
  const outDir = path.join(root, "data", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "latest_portfolio_diversification.json");
  const mdPath = path.join(outDir, "latest_portfolio_diversification.md");

  const prev = readExistingPayload(root);
  const payload: PortfolioDiversificationFilePayload = {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    pp: section === "pp" ? { enabled, report } : prev.pp ?? null,
    ud: section === "ud" ? { enabled, report } : prev.ud ?? null,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const md = [
    "# Phase 77 — Portfolio diversification",
    "",
    `Generated: **${payload.generatedAtUtc}**`,
    "",
    ...renderReportSection("PrizePicks", payload.pp),
    ...renderReportSection("Underdog", payload.ud),
  ].join("\n");
  fs.writeFileSync(mdPath, md, "utf8");
}
