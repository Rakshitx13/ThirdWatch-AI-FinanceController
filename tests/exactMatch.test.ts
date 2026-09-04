import { evaluateExactMatch } from "../matching-engine/exactMatch";
import { makeCandidate } from "./matchingFixtures";

describe("exact match rule", () => {
  test.each([
    [0, true],
    [0.5, true],
    [1, true],
    [1.01, false]
  ])("₹%s difference -> matched=%s", (difference, expected) => {
    expect(evaluateExactMatch(makeCandidate(difference)).matched).toBe(expected);
    expect(evaluateExactMatch(makeCandidate(-difference)).matched).toBe(expected);
  });

  test("requires the normal one-to-two-working-day window", () => {
    expect(evaluateExactMatch(makeCandidate(0, 1)).matched).toBe(true);
    expect(evaluateExactMatch(makeCandidate(0, 2)).matched).toBe(true);
    expect(evaluateExactMatch(makeCandidate(0, 3)).matched).toBe(false);
  });

  test("never matches through a duplicate-reference conflict", () => {
    expect(evaluateExactMatch(makeCandidate(0), true).matched).toBe(false);
  });
});
