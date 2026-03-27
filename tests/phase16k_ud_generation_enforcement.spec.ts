/**
 * Phase 16K: Underdog 7/8 leg cards — Flex generation only; Standard 7/8 not generated.
 */
import {
  UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION,
  UNDERDOG_FLEX_STRUCTURES,
  UNDERDOG_STANDARD_STRUCTURES,
  getUnderdogStructureById,
} from "../src/config/underdog_structures";
import { getStructure } from "../src/config/parlay_structures";

describe("Phase 16K UD standard generation allowlist", () => {
  it("does not include UD_7P_STD or UD_8P_STD (7–8 leg Standard not generated)", () => {
    expect(UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION).not.toContain("UD_7P_STD");
    expect(UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION).not.toContain("UD_8P_STD");
    expect(UNDERDOG_STANDARD_STRUCTURE_IDS_FOR_GENERATION).toEqual(
      expect.arrayContaining(["UD_2P_STD", "UD_3P_STD", "UD_4P_STD", "UD_5P_STD", "UD_6P_STD"])
    );
  });

  it("full standard registry still lists 7/8 for breakeven / math (unchanged)", () => {
    const ids = UNDERDOG_STANDARD_STRUCTURES.map((s) => s.id);
    expect(ids).toContain("UD_7P_STD");
    expect(ids).toContain("UD_8P_STD");
    expect(getStructure("UD_7P_STD")?.size).toBe(7);
    expect(getStructure("UD_8P_STD")?.size).toBe(8);
  });

  it("Flex 7/8 structures remain available for generation", () => {
    const flexIds = UNDERDOG_FLEX_STRUCTURES.map((s) => s.id);
    expect(flexIds).toContain("UD_7F_FLX");
    expect(flexIds).toContain("UD_8F_FLX");
    expect(getUnderdogStructureById("UD_7F_FLX")?.type).toBe("flex");
    expect(getUnderdogStructureById("UD_8F_FLX")?.type).toBe("flex");
  });
});
