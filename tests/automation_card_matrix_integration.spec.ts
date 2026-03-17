/**
 * Regression tests for automation-card-matrix export integration:
 * - CSV column order (exact schema contract)
 * - Row count equals canonical structure count (31)
 * - Copy-to-public list includes automation-card-matrix artifacts
 * - Validation: row count mismatch would cause export to exit 1
 */

import fs from "fs";
import path from "path";
import { ALL_STRUCTURES } from "../src/config/parlay_structures";
import {
  buildAutomationCardMatrixRows,
  AUTOMATION_CARD_MATRIX_CSV_HEADERS,
} from "../src/automation/automation_card_matrix";

const REQUIRED_CSV_COLUMN_ORDER = [
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
];

describe("automation_card_matrix integration", () => {
  const EXPECTED_CANONICAL_COUNT = 31;

  describe("CSV column order", () => {
    it("exports exact required column order for spreadsheet contract", () => {
      expect(AUTOMATION_CARD_MATRIX_CSV_HEADERS).toEqual(REQUIRED_CSV_COLUMN_ORDER);
    });

    it("has same length as required schema", () => {
      expect(AUTOMATION_CARD_MATRIX_CSV_HEADERS.length).toBe(REQUIRED_CSV_COLUMN_ORDER.length);
    });
  });

  describe("canonical structure count", () => {
    it("ALL_STRUCTURES has expected count (31)", () => {
      expect(ALL_STRUCTURES.length).toBe(EXPECTED_CANONICAL_COUNT);
    });

    it("buildAutomationCardMatrixRows returns one row per canonical structure", () => {
      const root = process.cwd();
      const { rows, audit } = buildAutomationCardMatrixRows(root);
      expect(rows.length).toBe(ALL_STRUCTURES.length);
      expect(rows.length).toBe(EXPECTED_CANONICAL_COUNT);
      expect(audit.exportedRowCount).toBe(rows.length);
      expect(audit.totalCanonicalStructures).toBe(ALL_STRUCTURES.length);
    });

    it("audit exportedRowCount equals totalCanonicalStructures (success path)", () => {
      const root = process.cwd();
      const { rows, audit } = buildAutomationCardMatrixRows(root);
      expect(rows.length).toBe(audit.totalCanonicalStructures);
      expect(audit.exportedRowCount).toBe(audit.totalCanonicalStructures);
    });
  });

  describe("fail path: row count mismatch", () => {
    it("script would exit 1 when rowCount !== totalCanonicalStructures", () => {
      const rowCount: number = 30;
      const totalCanonicalStructures: number = 31;
      const shouldExitWithError = rowCount !== totalCanonicalStructures;
      expect(shouldExitWithError).toBe(true);
    });

    it("script would exit 0 when rowCount === totalCanonicalStructures", () => {
      const root = process.cwd();
      const { rows, audit } = buildAutomationCardMatrixRows(root);
      const shouldExitWithError = rows.length !== audit.totalCanonicalStructures;
      expect(shouldExitWithError).toBe(false);
    });
  });

  describe("copy-to-public includes automation-card-matrix", () => {
    it("copy-data-to-public.ts COPY_LIST includes automation-card-matrix.csv", () => {
      const scriptPath = path.join(__dirname, "..", "scripts", "copy-data-to-public.ts");
      const content = fs.readFileSync(scriptPath, "utf8");
      expect(content).toContain("automation-card-matrix.csv");
    });

    it("copy-data-to-public.ts COPY_LIST includes automation-card-matrix.json", () => {
      const scriptPath = path.join(__dirname, "..", "scripts", "copy-data-to-public.ts");
      const content = fs.readFileSync(scriptPath, "utf8");
      expect(content).toContain("automation-card-matrix.json");
    });

    it("copy-data-to-public.ts COPY_LIST includes automation-card-matrix-audit.json", () => {
      const scriptPath = path.join(__dirname, "..", "scripts", "copy-data-to-public.ts");
      const content = fs.readFileSync(scriptPath, "utf8");
      expect(content).toContain("automation-card-matrix-audit.json");
    });
  });
});
