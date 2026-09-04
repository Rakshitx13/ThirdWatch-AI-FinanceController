import { evaluatePossibleRefund } from "../matching-engine/refundDetector";
import { makeCandidate } from "./matchingFixtures";

describe("possible refund rule", () => {
  test.each([50, 300])("detects a ₹%s unexplained shortfall", (shortfall) => {
    const evaluation = evaluatePossibleRefund(makeCandidate(-shortfall));
    expect(evaluation.matched).toBe(true);
    expect(evaluation.reason).toContain(`shortfall ₹${shortfall.toFixed(2)}`);
    expect(evaluation.reason).toContain("Possible refund / unexplained settlement shortfall");
  });

  test("does not call drift within ₹5 a refund", () => {
    expect(evaluatePossibleRefund(makeCandidate(-5)).matched).toBe(false);
  });

  test("does not call an over-settlement a refund", () => {
    expect(evaluatePossibleRefund(makeCandidate(50)).matched).toBe(false);
  });

  test("supports a valid unlinked candidate but rejects a conflicting link", () => {
    expect(evaluatePossibleRefund(makeCandidate(-50, 2, { linked_order_id: "" })).matched).toBe(true);
    expect(evaluatePossibleRefund(makeCandidate(-50, 2, { linked_order_id: "ORD_OTHER" })).matched).toBe(false);
  });

  test("does not resolve a duplicate-reference conflict", () => {
    expect(evaluatePossibleRefund(makeCandidate(-50), true).matched).toBe(false);
  });
});
