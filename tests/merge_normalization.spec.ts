/**
 * Regression tests for merge_odds.ts normalization fixes (20260313).
 * - Fix 1: normalizeForMatch dot stripping (and apostrophe, whitespace)
 * - Fix 2: resolvePlayerNameForMatch alias applied on odds side (both variants match)
 * - Fix 3: LINE_TOLERANCE / MAX_LINE_DIFF widened to 1.0
 */

import {
  normalizeForMatch,
  resolvePlayerNameForMatch,
  MAX_LINE_DIFF,
} from "../src/merge_odds";

describe("normalizeForMatch — dot stripping", () => {
  it('"T.J. McConnell" → "tj mcconnell"', () => {
    expect(normalizeForMatch("T.J. McConnell")).toBe("tj mcconnell");
  });

  it('"D.J. Augustin" → "dj augustin"', () => {
    expect(normalizeForMatch("D.J. Augustin")).toBe("dj augustin");
  });

  it("apostrophe strip still works: \"Kel'el Ware\" → \"kelel ware\"", () => {
    expect(normalizeForMatch("Kel'el Ware")).toBe("kelel ware");
  });

  it("dots + apostrophes together: \"T.J. O'Brien\" → \"tj obrien\"", () => {
    expect(normalizeForMatch("T.J. O'Brien")).toBe("tj obrien");
  });

  it('extra whitespace collapsed: "  Karl   Anthony  Towns  " → "karl anthony towns"', () => {
    expect(normalizeForMatch("  Karl   Anthony  Towns  ")).toBe("karl anthony towns");
  });

  it('already clean name passthrough: "LeBron James" → "lebron james"', () => {
    expect(normalizeForMatch("LeBron James")).toBe("lebron james");
  });
});

describe("resolvePlayerNameForMatch — alias applied to odds side", () => {
  it("normalizeForMatch then resolve: hyphen variant equals space variant (alias match)", () => {
    // Alias in merge_odds: "nickeil alexander walker" → "nickeil alexander-walker"
    const normalizedHyphen = "nickeil alexander-walker";
    const normalizedSpace = "nickeil alexander walker";
    const afterResolveHyphen = resolvePlayerNameForMatch(normalizedHyphen);
    const afterResolveSpace = resolvePlayerNameForMatch(normalizedSpace);
    expect(normalizeForMatch(afterResolveHyphen)).toBe(normalizeForMatch(afterResolveSpace));
  });

  it("name with no alias passes through unchanged", () => {
    expect(resolvePlayerNameForMatch("nicolas claxton")).toBe("nicolas claxton");
  });

  it("dot-normalized name does not crash resolvePlayerNameForMatch", () => {
    expect(() => resolvePlayerNameForMatch("t.j. mcconnell")).not.toThrow();
    expect(resolvePlayerNameForMatch("t.j. mcconnell")).toBe("tj mcconnell");
  });
});

describe("LINE_TOLERANCE / MAX_LINE_DIFF — widened to 1.0", () => {
  it("the exported constant is >= 1.0", () => {
    expect(MAX_LINE_DIFF).toBeGreaterThanOrEqual(1.0);
  });

  it("a pick line of 24.5 vs odds line of 25.5 (delta=1.0) is within tolerance", () => {
    const pickLine = 24.5;
    const oddsLine = 25.5;
    expect(Math.abs(oddsLine - pickLine)).toBeLessThanOrEqual(MAX_LINE_DIFF);
  });

  it("a pick line of 24.5 vs odds line of 26.0 (delta=1.5) is outside tolerance", () => {
    const pickLine = 24.5;
    const oddsLine = 26.0;
    expect(Math.abs(oddsLine - pickLine)).toBeGreaterThan(MAX_LINE_DIFF);
  });
});
