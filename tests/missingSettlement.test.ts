import { reconcileBatch } from "../matching-engine/classifier";
import { baseOrder, makeCandidate } from "./matchingFixtures";

describe("missing settlement rule", () => {
  test("classifies an order with zero candidates as NO_SETTLEMENT_FOUND", () => {
    const [result] = reconcileBatch([baseOrder], []);
    expect(result.status).toBe("NO_SETTLEMENT_FOUND");
    expect(result.reconciled).toBe(false);
    expect(result.candidateIds).toEqual([]);
    expect(result.reason).toContain("No settlement found for ORD_TEST");
    expect(result.reason).toContain("0 candidate row(s) considered");
    expect(result.reason).toContain("2026-08-04–2026-08-10");
  });

  test("does not force-match a weak or invalid-date candidate", () => {
    const invalid = makeCandidate(0, 2, {
      linked_order_id: "ORD_OTHER",
      settlement_date: "2026-07-01"
    }).settlement;
    const [result] = reconcileBatch([baseOrder], [invalid]);
    expect(result.status).toBe("NO_SETTLEMENT_FOUND");
    expect(result.selectedPaymentId).toBeNull();
  });
});
