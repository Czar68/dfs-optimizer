import fs from "fs";
import path from "path";
import csv from "csv-parser";

import { getDataPath, NBA_PROPS_MASTER_CSV } from "../src/constants/paths";

type PropHistoryRow = {
  date?: string;
  snapshot_time?: string;
  player?: string;
  team?: string;
  opponent?: string;
  prop_type?: string;
  line?: string;
  implied_probability?: string;
};

type ResultRow = {
  date?: string;
  player?: string;
  stat_type?: string;
  line?: string;
  actual_stat?: string;
  hit?: string;
};

type LineMovementRow = {
  date?: string;
  player?: string;
  stat?: string;
  line_delta?: string;
  delta?: string;
};

type ClvRow = {
  date?: string;
  player?: string;
  stat_type?: string;
  line?: string;
  implied_prob?: string;
  clv?: string;
};

type TrainingExample = {
  player: string;
  statType: string;
  line: number;
  impliedProb: number;
  lineMovement: number;
  hoursBeforeGame: number;
  hit: number;
};

async function readCsv<T = Record<string, unknown>>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      resolve([]);
      return;
    }
    const rows: T[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data: Record<string, unknown>) => rows.push(data as T))
      .on("end", () => resolve(rows))
      .on("error", (err: Error) => reject(err));
  });
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toKey(date: string, player: string, statType: string, line: number): string {
  return `${date}|${player.toLowerCase()}|${statType.toLowerCase()}|${line.toFixed(2)}`;
}

function parseTimeToDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const isoCandidate = `${dateStr}T${timeStr}`;
  const d = new Date(isoCandidate);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function hoursDiff(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

// --- Very small gradient boosted decision stump model ------------------------

type Stump = {
  feature: string;
  threshold: number;
  leftValue: number;
  rightValue: number;
};

type TrueProbModel = {
  featureNames: string[];
  playerEncoding: Record<string, number>;
  statTypeEncoding: Record<string, number>;
  initialBias: number;
  learningRate: number;
  stumps: Stump[];
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function encodeCategorical(
  values: string[],
  labels: number[]
): Record<string, number> {
  const sums = new Map<string, { hits: number; total: number }>();
  for (let i = 0; i < values.length; i += 1) {
    const key = values[i] || "";
    const entry = sums.get(key) ?? { hits: 0, total: 0 };
    entry.total += 1;
    entry.hits += labels[i] || 0;
    sums.set(key, entry);
  }
  const out: Record<string, number> = {};
  for (const [key, v] of sums.entries()) {
    out[key] = v.total > 0 ? v.hits / v.total : 0.5;
  }
  return out;
}

function buildDesignMatrix(
  examples: TrainingExample[],
  playerEnc: Record<string, number>,
  statEnc: Record<string, number>
): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (const ex of examples) {
    const row: number[] = [];
    row.push(ex.line);
    row.push(ex.impliedProb);
    row.push(ex.lineMovement);
    row.push(ex.hoursBeforeGame);
    row.push(playerEnc[ex.player] ?? 0.5);
    row.push(statEnc[ex.statType] ?? 0.5);
    X.push(row);
    y.push(ex.hit);
  }
  return { X, y };
}

function trainGradientBoostedStumps(
  X: number[][],
  y: number[],
  featureNames: string[],
  numIterations = 50,
  learningRate = 0.1
): { initialBias: number; stumps: Stump[] } {
  const n = y.length;
  if (n === 0) {
    return { initialBias: 0, stumps: [] };
  }

  const posRate = y.reduce((s, v) => s + v, 0) / n;
  const eps = 1e-6;
  const initialBias = Math.log((posRate + eps) / (1 - posRate + eps));

  const f = new Array<number>(n).fill(initialBias);
  const stumps: Stump[] = [];

  for (let iter = 0; iter < numIterations; iter += 1) {
    const residuals = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const p = sigmoid(f[i]);
      residuals[i] = y[i] - p;
    }

    let bestFeature = -1;
    let bestThreshold = 0;
    let bestScore = -Infinity;
    let bestLeft = 0;
    let bestRight = 0;

    const numFeatures = featureNames.length;
    for (let j = 0; j < numFeatures; j += 1) {
      const values = X.map((row) => row[j]);
      const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
      if (sorted.length < 2) continue;

      // Candidate thresholds between unique sorted values
      for (let k = 0; k < sorted.length - 1; k += 1) {
        const thr = (sorted[k] + sorted[k + 1]) / 2;
        let sumL = 0;
        let cntL = 0;
        let sumR = 0;
        let cntR = 0;
        for (let i = 0; i < n; i += 1) {
          if (values[i] <= thr) {
            sumL += residuals[i];
            cntL += 1;
          } else {
            sumR += residuals[i];
            cntR += 1;
          }
        }
        if (cntL === 0 || cntR === 0) continue;
        const meanL = sumL / cntL;
        const meanR = sumR / cntR;
        // Simple squared-error reduction proxy
        const score = meanL * meanL * cntL + meanR * meanR * cntR;
        if (score > bestScore) {
          bestScore = score;
          bestFeature = j;
          bestThreshold = thr;
          bestLeft = meanL;
          bestRight = meanR;
        }
      }
    }

    if (bestFeature === -1) break;

    const stump: Stump = {
      feature: featureNames[bestFeature],
      threshold: bestThreshold,
      leftValue: bestLeft * learningRate,
      rightValue: bestRight * learningRate,
    };
    stumps.push(stump);

    for (let i = 0; i < n; i += 1) {
      const val = X[i][bestFeature];
      const delta = val <= bestThreshold ? stump.leftValue : stump.rightValue;
      f[i] += delta;
    }
  }

  return { initialBias, stumps };
}

async function main(): Promise<void> {
  const propHistoryPath = getDataPath(NBA_PROPS_MASTER_CSV);
  const resultsPath = getDataPath(path.join("results", "nba_results_master.csv"));
  const lineMovementPath = getDataPath(path.join("output_logs", "line_movement.csv"));
  const clvPath = getDataPath(path.join("models", "prop_clv_dataset.csv"));
  const outModelPath = getDataPath(path.join("models", "true_prob_model.json"));

  const [propHistory, results, lineMovement, clvRows] = await Promise.all([
    readCsv<PropHistoryRow>(propHistoryPath),
    readCsv<ResultRow>(resultsPath),
    readCsv<LineMovementRow>(lineMovementPath),
    readCsv<ClvRow>(clvPath),
  ]);

  console.log(
    `[TRAIN] Loaded prop_history=${propHistory.length}, results=${results.length}, line_movement=${lineMovement.length}, clv=${clvRows.length}`
  );

  const resultByKey = new Map<string, ResultRow>();
  for (const r of results) {
    const date = (r.date ?? "").trim();
    const player = (r.player ?? "").trim();
    const statType = (r.stat_type ?? "").trim();
    const lineVal = parseNumber(r.line);
    if (!date || !player || !statType || lineVal == null) continue;
    const key = toKey(date, player, statType, lineVal);
    resultByKey.set(key, r);
  }

  const lmByKey = new Map<string, LineMovementRow>();
  for (const r of lineMovement) {
    const date = (r.date ?? "").trim();
    const player = (r.player ?? "").trim();
    const stat = (r.stat ?? "").trim();
    if (!date || !player || !stat) continue;
    const key = `${date}|${player.toLowerCase()}|${stat.toLowerCase()}`;
    lmByKey.set(key, r);
  }

  const clvByKey = new Map<string, ClvRow>();
  for (const r of clvRows) {
    const date = (r.date ?? "").trim();
    const player = (r.player ?? "").trim();
    const statType = (r.stat_type ?? "").trim();
    const lineVal = parseNumber(r.line);
    if (!date || !player || !statType || lineVal == null) continue;
    const key = toKey(date, player, statType, lineVal);
    clvByKey.set(key, r);
  }

  const examples: TrainingExample[] = [];

  for (const p of propHistory) {
    const date = (p.date ?? "").trim();
    const player = (p.player ?? "").trim();
    const statType = (p.prop_type ?? "").trim();
    const lineVal = parseNumber(p.line);
    const impliedProb = parseNumber(p.implied_probability);
    if (!date || !player || !statType || lineVal == null || impliedProb == null) continue;

    const key = toKey(date, player, statType, lineVal);
    const res = resultByKey.get(key);
    if (!res) continue;

    const hitVal = parseNumber(res.hit ?? res.actual_stat);
    if (hitVal == null) continue;
    const hit = hitVal !== 0 ? 1 : 0;

    const snapshotTime = (p.snapshot_time ?? "").trim();
    const gameTimeRow = parseTimeToDate(date, (res as any).game_time ?? "");
    const snapshotDate = parseTimeToDate(date, snapshotTime);
    let hoursBeforeGame = 0;
    if (snapshotDate && gameTimeRow) {
      hoursBeforeGame = hoursDiff(snapshotDate, gameTimeRow);
    }

    const lmKey = `${date}|${player.toLowerCase()}|${statType.toLowerCase()}`;
    const lm = lmByKey.get(lmKey);
    let lineMovement = 0;
    if (lm) {
      const d = parseNumber(lm.line_delta ?? lm.delta);
      if (d != null) lineMovement = d;
    }

    // CLV dataset is loaded primarily to ensure we only train on rows that have CLV context if desired later.
    // For now we do not use clv directly as a feature, but the dataset is part of the training data contract.
    const _clv = clvByKey.get(key);
    // (placeholder for future clv-derived features)

    examples.push({
      player,
      statType,
      line: lineVal,
      impliedProb,
      lineMovement,
      hoursBeforeGame,
      hit,
    });
  }

  console.log(`[TRAIN] Built ${examples.length} training examples`);

  if (examples.length === 0) {
    console.warn("[TRAIN] No training examples; writing empty model.");
    const emptyModel: TrueProbModel = {
      featureNames: ["line", "impliedProb", "lineMovement", "hoursBeforeGame", "playerEnc", "statTypeEnc"],
      playerEncoding: {},
      statTypeEncoding: {},
      initialBias: 0,
      learningRate: 0.1,
      stumps: [],
    };
    fs.writeFileSync(outModelPath, JSON.stringify(emptyModel, null, 2), "utf8");
    return;
  }

  const players = examples.map((e) => e.player);
  const statTypes = examples.map((e) => e.statType);
  const labels = examples.map((e) => e.hit);
  const playerEnc = encodeCategorical(players, labels);
  const statEnc = encodeCategorical(statTypes, labels);

  const featureNames = ["line", "impliedProb", "lineMovement", "hoursBeforeGame", "playerEnc", "statTypeEnc"];
  const { X, y } = buildDesignMatrix(examples, playerEnc, statEnc);

  const numIterations = 60;
  const learningRate = 0.1;
  const { initialBias, stumps } = trainGradientBoostedStumps(
    X,
    y,
    featureNames,
    numIterations,
    learningRate
  );

  const model: TrueProbModel = {
    featureNames,
    playerEncoding: playerEnc,
    statTypeEncoding: statEnc,
    initialBias,
    learningRate,
    stumps,
  };

  fs.writeFileSync(outModelPath, JSON.stringify(model, null, 2), "utf8");
  console.log("[TRAIN] Saved true probability model to", outModelPath);
}

main().catch((err) => {
  console.error("[TRAIN] Failed to train true probability model:", err);
  process.exitCode = 1;
});

