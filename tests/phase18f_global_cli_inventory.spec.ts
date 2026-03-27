/**
 * Phase 18F — Repo-wide inventory: production TypeScript under src/ (excluding src/__tests__ and cli_args.ts)
 * must not call getCliArgs() except the two canonical entrypoint snapshots.
 * No runtime module may import the cliArgs Proxy (export lives only in cli_args.ts).
 */
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      walkTsFiles(p, acc);
    } else if (name.endsWith(".ts")) {
      acc.push(p);
    }
  }
  return acc;
}

function read(relFromRoot: string): string {
  return fs.readFileSync(path.join(root, relFromRoot), "utf8");
}

function countGetCliArgsCalls(src: string): number {
  const m = src.match(/\bgetCliArgs\s*\(/g);
  return m ? m.length : 0;
}

/** True if `cliArgs` appears as a value import (not `import type`). */
function importsCliArgsProxy(src: string): boolean {
  const lines = src.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;
    if (!t.startsWith("import")) continue;
    if (/import\s+type\s+/.test(t)) continue;
    if (/\bimport\s*\{[^}]*\bcliArgs\b[^}]*\}\s*from/.test(t)) return true;
  }
  return false;
}

describe("Phase 18F — global getCliArgs / cliArgs inventory (runtime src)", () => {
  const srcRoot = path.join(root, "src");
  const allSrcTs = walkTsFiles(srcRoot).filter(
    (p) => !p.includes(`${path.sep}__tests__${path.sep}`)
  );

  it("only run_optimizer.ts and run_underdog_optimizer.ts call getCliArgs() outside cli_args.ts", () => {
    const offenders: string[] = [];
    const allowed = new Set([
      path.normalize(path.join(srcRoot, "run_optimizer.ts")),
      path.normalize(path.join(srcRoot, "run_underdog_optimizer.ts")),
    ]);

    for (const abs of allSrcTs) {
      const norm = path.normalize(abs);
      if (norm.endsWith(`${path.sep}cli_args.ts`)) continue;
      if (allowed.has(norm)) continue;
      const n = countGetCliArgsCalls(fs.readFileSync(abs, "utf8"));
      if (n > 0) offenders.push(`${path.relative(root, abs)} (${n})`);
    }
    expect(offenders).toEqual([]);
  });

  it("run_optimizer.ts has exactly one getCliArgs() (orchestration snapshot)", () => {
    const n = countGetCliArgsCalls(read("src/run_optimizer.ts"));
    expect(n).toBe(1);
  });

  it("run_underdog_optimizer.ts has exactly one getCliArgs() (main fallback when cli omitted)", () => {
    const n = countGetCliArgsCalls(read("src/run_underdog_optimizer.ts"));
    expect(n).toBe(1);
  });

  it("no production src file imports the cliArgs Proxy except re-export site", () => {
    const offenders: string[] = [];
    for (const abs of allSrcTs) {
      if (abs.endsWith("cli_args.ts")) continue;
      if (importsCliArgsProxy(fs.readFileSync(abs, "utf8"))) {
        offenders.push(path.relative(root, abs));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("prior explicit-CLI boundaries remain clean (spot-check)", () => {
    expect(read("src/merge_odds.ts")).not.toMatch(/\bgetCliArgs\b/);
    expect(read("src/pp_engine.ts")).not.toMatch(/\bgetCliArgs\b/);
    expect(read("src/ud_engine.ts")).not.toMatch(/\bgetCliArgs\b/);
  });
});
