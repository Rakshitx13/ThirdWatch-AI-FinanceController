import {
  discoverCandidates,
  EXACT_AMOUNT_SCORE,
  LINKED_ORDER_ID_CONFLICT_PENALTY,
  LINKED_ORDER_ID_SCORE,
  NORMAL_DATE_SCORE,
  scoreCandidate,
  VALID_FEE_PROFILE_SCORE,
  WIDE_TOLERANCE_AMOUNT_SCORE
} from "../matching-engine/candidateMatcher";
import { baseOrder, makeCandidate } from "./matchingFixtures";

describe("candidate discovery", () => {
  test("scores independent reference, amount, date, fee, and GST signals", () => {
    const candidate = makeCandidate(0, 2);
    expect(candidate.score).toBe(
      LINKED_ORDER_ID_SCORE + EXACT_AMOUNT_SCORE + NORMAL_DATE_SCORE + VALID_FEE_PROFILE_SCORE
    );
    expect(candidate.signals).toEqual([
      "LINKED_ORDER_ID_EXACT",
      "SETTLEMENT_AMOUNT_EXACT",
      "NORMAL_SETTLEMENT_WINDOW",
      "FEE_AND_GST_PROFILE_VALID"
    ]);
  });

  test("discovers a fee-adjusted candidate without trusting linked_order_id", () => {
    const candidate = makeCandidate(3, 2, { linked_order_id: "" });
    const discovered = discoverCandidates(baseOrder, [candidate.settlement]);
    expect(discovered).toHaveLength(1);
    expect(discovered[0].score).toBe(
      WIDE_TOLERANCE_AMOUNT_SCORE + NORMAL_DATE_SCORE + VALID_FEE_PROFILE_SCORE
    );
    expect(discovered[0].signals).not.toContain("LINKED_ORDER_ID_EXACT");
  });

  test("keeps linked evidence but records conflicting financial signals", () => {
    const candidate = makeCandidate(-100, 2);
    expect(candidate.score).toBe(LINKED_ORDER_ID_SCORE + NORMAL_DATE_SCORE + VALID_FEE_PROFILE_SCORE);
    expect(candidate.signals).not.toContain("SETTLEMENT_AMOUNT_EXACT");
    expect(candidate.amountDifference).toBe(-100);
  });

  test("penalizes an explicit link to another order but treats a blank link as neutral", () => {
    const blank = makeCandidate(0, 2, { linked_order_id: "" });
    const conflicting = makeCandidate(0, 2, { linked_order_id: "ORD_OTHER" });
    expect(blank.signals).not.toContain("LINKED_ORDER_ID_CONFLICT");
    expect(conflicting.signals).toContain("LINKED_ORDER_ID_CONFLICT");
    expect(blank.score - conflicting.score).toBe(LINKED_ORDER_ID_CONFLICT_PENALTY);
  });

  test("filters weak candidates and sorts credible candidates deterministically", () => {
    const strong = makeCandidate(0, 2, { payment_id: "pay_B", linked_order_id: "" });
    const medium = makeCandidate(3, 2, { payment_id: "pay_A", linked_order_id: "" });
    const weakSettlement = {
      ...makeCandidate(100, 8, { payment_id: "pay_C", linked_order_id: "", fee_deducted: 30, gst_on_fee: 5.4 })
        .settlement
    };
    const results = discoverCandidates(baseOrder, [weakSettlement, medium.settlement, strong.settlement]);
    expect(results.map((candidate) => candidate.settlement.payment_id)).toEqual(["pay_B", "pay_A"]);
    expect(scoreCandidate(baseOrder, weakSettlement).score).toBe(0);
  });
});
