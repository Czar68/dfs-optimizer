// src/stat_balance_chart.ts
//
// Stat Balance Radar Chart — Pure SVG Generator (zero dependencies)
//
// Generates a radar (spider) chart showing the stat distribution across an
// innovative card portfolio and saves it as an SVG file.
//
// Axes: PTS | REB | AST | 3PM | BLK | STL | PRA | OTHER
// One ring per 10% share, data polygon filled with gradient-style transparency.
// The output SVG renders correctly in any browser and can be attached to Telegram.

import fs from "fs";
import { InnovativeCard } from "./build_innovative_cards";

// ---------------------------------------------------------------------------
// Axis definitions
// ---------------------------------------------------------------------------
const AXES = [
  { key: "PTS",  label: "Points",     color: "#E63946" },
  { key: "REB",  label: "Rebounds",   color: "#457B9D" },
  { key: "AST",  label: "Assists",    color: "#2DC653" },
  { key: "3PM",  label: "3-Pointers", color: "#F4A261" },
  { key: "PRA",  label: "PRA",        color: "#A8DADC" },
  { key: "BLK",  label: "Blocks",     color: "#9B2335" },
  { key: "STL",  label: "Steals",     color: "#8338EC" },
  { key: "OTHER","label": "Other",    color: "#6C757D" },
];

// ---------------------------------------------------------------------------
// Compute stat distribution across all cards in the portfolio
// ---------------------------------------------------------------------------
export interface StatDistribution {
  shares:    Record<string, number>;  // axis key → share 0-1
  rawCounts: Record<string, number>;  // axis key → raw leg count
  total:     number;
}

export function computePortfolioStatDistribution(cards: InnovativeCard[]): StatDistribution {
  const rawCounts: Record<string, number> = {};
  let total = 0;

  for (const card of cards) {
    for (const [label, count] of Object.entries(card.statBalance)) {
      // Normalise to our axis keys
      const key = normaliseStatLabel(label);
      rawCounts[key] = (rawCounts[key] ?? 0) + count;
      total += count;
    }
  }

  const shares: Record<string, number> = {};
  for (const axis of AXES) {
    shares[axis.key] = total > 0 ? (rawCounts[axis.key] ?? 0) / total : 0;
  }

  return { shares, rawCounts, total };
}

function normaliseStatLabel(label: string): string {
  const upper = label.toUpperCase();
  const MAP: Record<string, string> = {
    PTS: "PTS", POINTS: "PTS",
    REB: "REB", REBOUNDS: "REB",
    AST: "AST", ASSISTS: "AST",
    "3PM": "3PM", THREES: "3PM",
    PRA: "PRA",
    BLK: "BLK", BLOCKS: "BLK",
    STL: "STL", STEALS: "STL",
    STKS: "BLK",  // blocks+steals → BLK bucket
  };
  return MAP[upper] ?? "OTHER";
}

// ---------------------------------------------------------------------------
// SVG math helpers
// ---------------------------------------------------------------------------
const TWO_PI = 2 * Math.PI;

function polarToCartesian(
  cx: number, cy: number,
  r: number,
  angleRad: number
): [number, number] {
  // Start at top (−π/2) and go clockwise
  return [
    cx + r * Math.cos(angleRad - Math.PI / 2),
    cy + r * Math.sin(angleRad - Math.PI / 2),
  ];
}

function polygonPoints(
  cx: number, cy: number, r: number, n: number, rotate = 0
): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const angle = rotate + (i / n) * TWO_PI;
    return polarToCartesian(cx, cy, r, angle);
  });
}

// ---------------------------------------------------------------------------
// Generate the radar SVG string
// ---------------------------------------------------------------------------
export function generateRadarSvgString(
  dist:   StatDistribution,
  title:  string,
  date:   string
): string {
  const W   = 540;
  const H   = 560;
  const CX  = 270;
  const CY  = 270;
  const R   = 200;
  const n   = AXES.length;
  const RINGS = 5;

  // axis endpoints
  const axisPoints = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * TWO_PI;
    return polarToCartesian(CX, CY, R, angle);
  });

  // Grid rings (faint concentric polygons at 20%, 40%, 60%, 80%, 100%)
  const gridLines = Array.from({ length: RINGS }, (_, ring) => {
    const rr = (R / RINGS) * (ring + 1);
    const pts = polygonPoints(CX, CY, rr, n);
    const d   = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z";
    return `<path d="${d}" fill="none" stroke="#334155" stroke-width="1" opacity="0.5"/>`;
  }).join("\n  ");

  // Axis spokes
  const spokes = axisPoints.map(([x, y]) =>
    `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#334155" stroke-width="1.5" opacity="0.7"/>`
  ).join("\n  ");

  // Data polygon (stat distribution)
  const dataPoints = AXES.map((axis, i) => {
    const share = dist.shares[axis.key] ?? 0;
    const angle = (i / n) * TWO_PI;
    return polarToCartesian(CX, CY, R * share, angle);
  });
  const dataPoly = dataPoints.map(([x, y], i) =>
    `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
  ).join(" ") + " Z";

  // Per-axis colored dots on data polygon
  const dataDots = dataPoints.map(([x, y], i) => {
    const share = dist.shares[AXES[i].key] ?? 0;
    if (share < 0.01) return "";
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${AXES[i].color}" stroke="#fff" stroke-width="1.5"/>`;
  }).join("\n  ");

  // Axis labels (with percentage annotation)
  const labels = axisPoints.map(([x, y], i) => {
    const axis   = AXES[i];
    const share  = dist.shares[axis.key] ?? 0;
    const pct    = Math.round(share * 100);
    const count  = dist.rawCounts[axis.key] ?? 0;

    // Push label slightly beyond the axis endpoint
    const angle  = (i / n) * TWO_PI - Math.PI / 2;
    const lx     = CX + (R + 28) * Math.cos(angle);
    const ly     = CY + (R + 28) * Math.sin(angle);
    const anchor = lx < CX - 5 ? "end" : lx > CX + 5 ? "start" : "middle";

    if (count === 0) return "";
    return [
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"`,
      `  font-family="ui-monospace,monospace" font-size="13" fill="${axis.color}" font-weight="700">${axis.key} ${pct}%</text>`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 16).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle"`,
      `  font-family="ui-monospace,monospace" font-size="10" fill="#94A3B8">${count} leg${count !== 1 ? "s" : ""}</text>`,
    ].join(" ");
  }).join("\n  ");

  // Ring percentage labels (right side)
  const ringLabels = Array.from({ length: RINGS }, (_, i) => {
    const pct = ((i + 1) / RINGS) * 100;
    const y   = CY - (R / RINGS) * (i + 1);
    return `<text x="${(CX + 6).toFixed(0)}" y="${y.toFixed(0)}" font-family="ui-monospace,monospace" font-size="9" fill="#475569">${pct.toFixed(0)}%</text>`;
  }).join("\n  ");

  // Legend (bottom)
  const legendCols = 4;
  const legendItems = AXES.filter(a => (dist.rawCounts[a.key] ?? 0) > 0).map((axis, i) => {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const lx  = 50 + col * 115;
    const ly  = H - 65 + row * 18;
    const share = Math.round((dist.shares[axis.key] ?? 0) * 100);
    return [
      `<rect x="${lx}" y="${(ly - 7).toFixed(0)}" width="10" height="10" rx="2" fill="${axis.color}"/>`,
      `<text x="${lx + 14}" y="${ly.toFixed(0)}" font-family="ui-monospace,monospace" font-size="11" fill="#94A3B8">${axis.label} (${share}%)</text>`,
    ].join("");
  }).join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="dataFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2DC653" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#457B9D" stop-opacity="0.25"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0F172A" rx="12"/>

  <!-- Title -->
  <text x="${CX}" y="28" text-anchor="middle" font-family="ui-monospace,monospace"
    font-size="15" fill="#F1F5F9" font-weight="700">${title}</text>
  <text x="${CX}" y="46" text-anchor="middle" font-family="ui-monospace,monospace"
    font-size="11" fill="#64748B">${date} · ${dist.total} total legs across ${Object.values(dist.rawCounts).filter(c=>c>0).length} stat categories</text>

  <!-- Grid rings -->
  ${gridLines}

  <!-- Axis spokes -->
  ${spokes}

  <!-- Ring pct labels -->
  ${ringLabels}

  <!-- Data polygon -->
  <path d="${dataPoly}" fill="url(#dataFill)" stroke="#2DC653" stroke-width="2.5" opacity="0.9"/>

  <!-- Data dots -->
  ${dataDots}

  <!-- Axis labels -->
  ${labels}

  <!-- Legend -->
  <rect x="30" y="${H - 80}" width="${W - 60}" height="70" rx="6" fill="#1E293B" opacity="0.8"/>
  <text x="50" y="${H - 86}" font-family="ui-monospace,monospace" font-size="10" fill="#64748B">STAT DISTRIBUTION</text>
  ${legendItems}
</svg>`;
}

// ---------------------------------------------------------------------------
// Write SVG to disk and return the path
// ---------------------------------------------------------------------------
export function writeRadarChart(
  cards:   InnovativeCard[],
  outPath: string,
  date:    string
): string {
  const dist = computePortfolioStatDistribution(cards);
  const svg  = generateRadarSvgString(dist, "Portfolio Stat Balance", date);
  fs.writeFileSync(outPath, svg, "utf8");
  console.log(`[Chart] Wrote radar chart → ${outPath} (${cards.length} cards, ${dist.total} legs)`);
  return outPath;
}

// ---------------------------------------------------------------------------
// ASCII bar chart for console / Telegram (no image required)
// ---------------------------------------------------------------------------
export function buildAsciiStatBar(dist: StatDistribution): string {
  const BAR_WIDTH = 20;
  const lines: string[] = ["📊 Stat Balance:"];
  const sorted = AXES.filter(a => (dist.shares[a.key] ?? 0) > 0)
    .sort((a, b) => (dist.shares[b.key] ?? 0) - (dist.shares[a.key] ?? 0));

  for (const axis of sorted) {
    const share  = dist.shares[axis.key] ?? 0;
    const filled = Math.round(share * BAR_WIDTH);
    const bar    = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    const pct    = Math.round(share * 100);
    const count  = dist.rawCounts[axis.key] ?? 0;
    lines.push(`${axis.key.padEnd(5)} ${bar} ${pct}% (${count})`);
  }

  return lines.join("\n");
}
