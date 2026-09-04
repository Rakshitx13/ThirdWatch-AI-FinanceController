import { evaluateFeeAdjustedMatch } from "../matching-engine/feeAdjustedMatch";
import { makeCandidate } from "./matchingFixtures";

describe("fee-adjusted match rule", () => {
  test.each([
    [2, true],
    [5, true],
    [5.01, false]
  ])("₹%s difference -> matched=%s", (difference, expected) => {
    expect(evaluateFeeAdjustedMatch(makeCandidate(difference)).matched).toBe(expected);
    expect(evaluateFeeAdjustedMatch(makeCandidate(-difference)).matched).toBe(expected);
  });

  test("does not absorb values already inside exact tolerance", () => {
    expect(evaluateFeeAdjustedMatch(makeCandidate(1)).matched).toBe(false);
  });

  test("requires normal timing and no duplicate-reference conflict", () => {
    expect(evaluateFeeAdjustedMatch(makeCandidate(3, 3)).matched).toBe(false);
    expect(evaluateFeeAdjustedMatch(makeCandidate(3), true).matched).toBe(false);
  });

  test("includes the numerical difference in its audit-ready reason", () => {
    expect(evaluateFeeAdjustedMatch(makeCandidate(3.7)).reason).toContain("₹3.70");
  });
});
