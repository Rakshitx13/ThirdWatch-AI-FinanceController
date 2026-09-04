import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { discoverCandidates } from "./candidateMatcher";
import { evaluateDelayedSettlement } from "./delayedSettlement";
import { findDuplicateUtrs } from "./duplicateReference";
import { evaluateExactMatch } from "./exactMatch";
import { evaluateFeeAdjustedMatch } from "./feeAdjustedMatch";
import { explainMissingSettlement } from "./missingSettlement";
import { evaluatePossibleRefund } from "./refundDetector";
import { ReconciliationResult, ReconciliationStatus, SettlementCandidate } from "./types";

interface CandidateClassification {
  status: Exclude<ReconciliationStatus, "NO_SETTLEMENT_FOUND" | "DUPLICATE_REFERENCE">;
  reconciled: boolean;
  confidence: "HIGH" | "MEDIUM";
  reason: string;
  rulesEvaluated: string[];
}

interface CandidateEdge {
  candidate: SettlementCandidate;
  classification: CandidateClassification;
}

function classifyCandidate(candidate: SettlementCandidate): CandidateClassification | null {
  const rulesEvaluated: string[] = ["DUPLICATE_CHECK", "CANDIDATE_DISCOVERY", "EXACT_MATCH"];
  const exact = evaluateExactMatch(candidate);
  if (exact.matched) {
    return { status: "EXACT_MATCH", reconciled: true, confidence: "HIGH", reason: exact.reason, rulesEvaluated };
  }

  rulesEvaluated.push("FEE_ADJUSTED_MATCH");
  const feeAdjusted = evaluateFeeAdjustedMatch(candidate);
  if (feeAdjusted.matched) {
    return {
      status: "FEE_ADJUSTED_MATCH",
      reconciled: true,
      confidence: "MEDIUM",
      reason: feeAdjusted.reason,
      rulesEvaluated
    };
  }

  rulesEvaluated.push("DELAYED_SETTLEMENT");
  const delayed = evaluateDelayedSettlement(candidate);
  if (delayed.matched) {
    return {
      status: "DELAYED_SETTLEMENT",
      reconciled: true,
      confidence: "HIGH",
      reason: delayed.reason,
      rulesEvaluated
    };
  }

  rulesEvaluated.push("POSSIBLE_REFUND");
  const refund = evaluatePossibleRefund(candidate);
  if (refund.matched) {
    return {
      status: "POSSIBLE_REFUND",
      reconciled: false,
      confidence: "MEDIUM",
      reason: refund.reason,
      rulesEvaluated
    };
  }
  return null;
}

function resultFromEdge(edge: CandidateEdge, candidateIds: string[]): ReconciliationResult {
  const { candidate, classification } = edge;
  return {
    orderId: candidate.order.order_id,
    status: classification.status,
    reconciled: classification.reconciled,
    confidence: classification.confidence,
    reason: classification.reason,
    candidateIds,
    selectedPaymentId: candidate.settlement.payment_id,
    selectedUtr: candidate.settlement.utr,
    expectedSettlement: candidate.expectedSettlement,
    actualSettlement: candidate.settlement.settled_amount,
    amountDifference: candidate.amountDifference,
    unexplainedShortfall:
      classification.status === "POSSIBLE_REFUND" ? Math.max(0, -candidate.amountDifference) : null,
    settlementLagWorkingDays: candidate.settlementLagWorkingDays,
    rulesEvaluated: classification.rulesEvaluated
  };
}

export function reconcileBatch(
  orders: readonly MerchantOrder[],
  settlements: readonly SettlementRecord[]
): ReconciliationResult[] {
  const duplicateGroups = findDuplicateUtrs(orders, settlements);
  const duplicateByOrder = new Map<string, (typeof duplicateGroups)[number]>();
  for (const group of duplicateGroups) {
    group.orderIds.forEach((orderId) => duplicateByOrder.set(orderId, group));
  }

  const candidatesByOrder = new Map<string, SettlementCandidate[]>();
  const edges: CandidateEdge[] = [];
  for (const order of orders) {
    const candidates = discoverCandidates(order, settlements);
    candidatesByOrder.set(order.order_id, candidates);
    if (duplicateByOrder.has(order.order_id)) continue;
    for (const candidate of candidates) {
      if (duplicateGroups.some((group) => group.utr === candidate.settlement.utr)) continue;
      const classification = classifyCandidate(candidate);
      if (classification) edges.push({ candidate, classification });
    }
  }

  edges.sort((left, right) => {
    const leftLinked = left.candidate.signals.includes("LINKED_ORDER_ID_EXACT") ? 1 : 0;
    const rightLinked = right.candidate.signals.includes("LINKED_ORDER_ID_EXACT") ? 1 : 0;
    return (
      rightLinked - leftLinked ||
      right.candidate.score - left.candidate.score ||
      Math.abs(left.candidate.amountDifference) - Math.abs(right.candidate.amountDifference) ||
      left.candidate.order.order_id.localeCompare(right.candidate.order.order_id) ||
      left.candidate.settlement.payment_id.localeCompare(right.candidate.settlement.payment_id)
    );
  });

  const assignedOrders = new Set<string>();
  const assignedSettlements = new Set<string>();
  const resolved = new Map<string, ReconciliationResult>();
  for (const edge of edges) {
    const orderId = edge.candidate.order.order_id;
    const paymentId = edge.candidate.settlement.payment_id;
    if (assignedOrders.has(orderId) || assignedSettlements.has(paymentId)) continue;
    assignedOrders.add(orderId);
    assignedSettlements.add(paymentId);
    const candidateIds = (candidatesByOrder.get(orderId) ?? []).map(
      (candidate) => candidate.settlement.payment_id
    );
    resolved.set(orderId, resultFromEdge(edge, candidateIds));
  }

  return orders.map((order) => {
    const duplicate = duplicateByOrder.get(order.order_id);
    const candidates = candidatesByOrder.get(order.order_id) ?? [];
    if (duplicate) {
      const associated = duplicate.orderIds.join(", ");
      const ownRow = duplicate.settlements.find((row) => row.linked_order_id === order.order_id) ?? null;
      return {
        orderId: order.order_id,
        status: "DUPLICATE_REFERENCE",
        reconciled: false,
        confidence: "LOW",
        reason: `UTR ${duplicate.utr} is associated with multiple orders: ${associated}. No settlement row was selected.`,
        candidateIds: candidates.map((candidate) => candidate.settlement.payment_id),
        selectedPaymentId: null,
        selectedUtr: duplicate.utr,
        expectedSettlement: null,
        actualSettlement: ownRow?.settled_amount ?? null,
        amountDifference: null,
        unexplainedShortfall: null,
        settlementLagWorkingDays: null,
        rulesEvaluated: ["DUPLICATE_CHECK"]
      } satisfies ReconciliationResult;
    }

    const match = resolved.get(order.order_id);
    if (match) return match;
    const linkedCandidate = candidates.find((candidate) =>
      candidate.signals.includes("LINKED_ORDER_ID_EXACT")
    );
    return {
      orderId: order.order_id,
      status: "NO_SETTLEMENT_FOUND",
      reconciled: false,
      confidence: "LOW",
      reason: explainMissingSettlement(order, candidates, linkedCandidate?.expectedSettlement ?? null),
      candidateIds: candidates.map((candidate) => candidate.settlement.payment_id),
      selectedPaymentId: null,
      selectedUtr: null,
      expectedSettlement: linkedCandidate?.expectedSettlement ?? null,
      actualSettlement: null,
      amountDifference: null,
      unexplainedShortfall: null,
      settlementLagWorkingDays: null,
      rulesEvaluated: [
        "DUPLICATE_CHECK",
        "CANDIDATE_DISCOVERY",
        "EXACT_MATCH",
        "FEE_ADJUSTED_MATCH",
        "DELAYED_SETTLEMENT",
        "POSSIBLE_REFUND",
        "NO_SETTLEMENT_FOUND"
      ]
    } satisfies ReconciliationResult;
  });
}
