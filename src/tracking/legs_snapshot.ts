/**
 * Phase 102 — Immutable legs snapshot archives under **`data/legs_archive/<snapshot_id>/`**.
 * Snapshot id is deterministic from **`runTimestampEt`** (SHA-256 prefix); directories never overwrite (suffix **\_2**, … on collision).
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export const LEGS_ARCHIVE_DIRNAME = "legs_archive";
export const SNAPSHOT_META_FILENAME = "snapshot_meta.json";
export const LEGS_SNAPSHOT_REF_FILENAME = "legs_snapshot_ref.json";

const ROOT_LEGS_FILES = [
  "prizepicks-legs.csv",
  "prizepicks-legs.json",
  "underdog-legs.csv",
  "underdog-legs.json",
] as const;

export function deriveLegsSnapshotId(runTimestampEt: string): string {
  const h = crypto.createHash("sha256").update(runTimestampEt.trim(), "utf8").digest("hex");
  return `snap_${h.slice(0, 16)}`;
}

export function legsSnapshotDirectory(root: string, legsSnapshotId: string): string {
  return path.join(root, "data", LEGS_ARCHIVE_DIRNAME, legsSnapshotId);
}

export interface PersistLegsSnapshotResult {
  legsSnapshotId: string;
  filesCopied: string[];
  directory: string;
}

/**
 * Copies root-level legs artifacts into a **new** archive subdirectory. No-op if none of the four files exist.
 */
export function persistLegsSnapshotFromRootOutputs(
  root: string,
  runTimestampEt: string
): PersistLegsSnapshotResult | null {
  const baseId = deriveLegsSnapshotId(runTimestampEt);
  const archiveRoot = path.join(root, "data", LEGS_ARCHIVE_DIRNAME);
  let snapshotId = baseId;
  let dir = path.join(archiveRoot, snapshotId);
  let n = 0;
  while (fs.existsSync(dir)) {
    n += 1;
    snapshotId = `${baseId}_${n}`;
    dir = path.join(archiveRoot, snapshotId);
  }

  const filesCopied: string[] = [];
  for (const name of ROOT_LEGS_FILES) {
    const src = path.join(root, name);
    if (fs.existsSync(src)) {
      filesCopied.push(name);
    }
  }
  if (filesCopied.length === 0) return null;

  fs.mkdirSync(dir, { recursive: true });
  for (const name of filesCopied) {
    fs.copyFileSync(path.join(root, name), path.join(dir, name));
  }

  const meta = {
    legsSnapshotId: snapshotId,
    runTimestampEt: runTimestampEt.trim(),
    recordedAtUtc: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, SNAPSHOT_META_FILENAME), JSON.stringify(meta, null, 2), "utf8");

  const artifactsDir = path.join(root, "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, LEGS_SNAPSHOT_REF_FILENAME), JSON.stringify(meta, null, 2), "utf8");

  return { legsSnapshotId: snapshotId, filesCopied, directory: dir };
}

/**
 * Merge **`artifacts/legs_snapshot_ref.json`** into **`runTimestamp`** → **`legsSnapshotId`** (Phase **104**).
 * Archive **`snapshot_meta.json`** entries win on duplicate keys.
 */
export function mergeLegsSnapshotRefFromArtifacts(root: string, map: Map<string, string>): void {
  const refPath = path.join(root, "artifacts", LEGS_SNAPSHOT_REF_FILENAME);
  if (!fs.existsSync(refPath)) return;
  try {
    const j = JSON.parse(fs.readFileSync(refPath, "utf8")) as {
      runTimestampEt?: string;
      legsSnapshotId?: string;
    };
    const ts = j.runTimestampEt?.trim();
    const sid = j.legsSnapshotId?.trim();
    if (ts && sid && !map.has(ts)) map.set(ts, sid);
  } catch {
    /* skip */
  }
}

/** Map **`tier CSV runTimestamp`** → **`legsSnapshotId`** from **`snapshot_meta.json`** files + ref file. */
export function loadRunTimestampToLegsSnapshotId(root: string): Map<string, string> {
  const map = new Map<string, string>();
  const archiveRoot = path.join(root, "data", LEGS_ARCHIVE_DIRNAME);
  if (fs.existsSync(archiveRoot)) {
    for (const name of fs.readdirSync(archiveRoot)) {
      const sub = path.join(archiveRoot, name);
      if (!fs.statSync(sub).isDirectory()) continue;
      const metaPath = path.join(sub, SNAPSHOT_META_FILENAME);
      if (!fs.existsSync(metaPath)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
          runTimestampEt?: string;
          legsSnapshotId?: string;
        };
        const ts = j.runTimestampEt?.trim();
        const sid = (j.legsSnapshotId ?? name).trim();
        if (ts && sid) map.set(ts, sid);
      } catch {
        /* skip */
      }
    }
  }
  mergeLegsSnapshotRefFromArtifacts(root, map);
  return map;
}

export function tryPersistLegsSnapshotFromRootOutputs(root: string, runTimestampEt: string): void {
  try {
    const r = persistLegsSnapshotFromRootOutputs(root, runTimestampEt);
    if (r) {
      console.log(
        `[LegsSnapshot] Archived ${r.filesCopied.length} file(s) → data/${LEGS_ARCHIVE_DIRNAME}/${r.legsSnapshotId}/`
      );
    }
  } catch (e) {
    console.warn("[LegsSnapshot] persist failed:", (e as Error).message);
  }
}
