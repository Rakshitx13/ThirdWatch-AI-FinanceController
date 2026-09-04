import { evaluateDelayedSettlement } from "../matching-engine/delayedSettlement";
import { makeCandidate } from "./matchingFixtures";

describe("delayed settlement rule", () => {
  test.each([
    [2, false],
    [3, true],
    [5, true],
    [6, false]
  ])("%s working-day lag -> matched=%s", (lag, expected) => {
    expect(evaluateDelayedSettlement(makeCandidate(0, lag)).matched).toBe(expected);
  });

  test("requires a financially reconciled amount", () => {
    expect(evaluateDelayedSettlement(makeCandidate(1, 3)).matched).toBe(true);
    expect(evaluateDelayedSettlement(makeCandidate(1.01, 3)).matched).toBe(false);
  });

  test("never resolves a duplicate-reference conflict", () => {
    expect(evaluateDelayedSettlement(makeCandidate(0, 3), true).matched).toBe(false);
  });
});
