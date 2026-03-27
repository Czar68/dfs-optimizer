import fs from "fs";
import os from "os";
import path from "path";
import { existingLegCsvPaths, loadLegsMap } from "../src/tracking/legs_csv_index";

describe("legs_csv_index — archive CSV discovery", () => {
  it("existingLegCsvPaths includes data/legs_archive dated CSVs in sorted filename order", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legs-arch-"));
    const arch = path.join(dir, "data", "legs_archive");
    fs.mkdirSync(arch, { recursive: true });
    for (const f of ["prizepicks-legs-20260316.csv", "prizepicks-legs-20260312.csv", "underdog-legs-20260314.csv"]) {
      fs.writeFileSync(path.join(arch, f), "id,player,stat,line,book,league,trueProb,legEv\n", "utf8");
    }
    const paths = existingLegCsvPaths(dir).filter((p) => p.includes("legs_archive"));
    expect(paths.map((p) => path.basename(p))).toEqual([
      "prizepicks-legs-20260312.csv",
      "prizepicks-legs-20260316.csv",
      "underdog-legs-20260314.csv",
    ]);
  });

  it("loadLegsMap ingests Sport,id,... archive headers (id column present)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legs-arch2-"));
    const arch = path.join(dir, "data", "legs_archive");
    fs.mkdirSync(arch, { recursive: true });
    const header =
      "Sport,id,player,team,stat,line,league,book,overOdds,underOdds,trueProb,edge,legEv,runTimestamp,gameTime\n";
    const row =
      "NBA,prizepicks-999-test-stat-1.5,X,Y,stat,1.5,NBA,FD,-110,-110,0.5,0,0,ts,gt\n";
    fs.writeFileSync(path.join(arch, "prizepicks-legs-20260312.csv"), header + row, "utf8");
    const m = loadLegsMap(existingLegCsvPaths(dir));
    expect(m.has("prizepicks-999-test-stat-1.5")).toBe(true);
  });
});
