import { MerchantOrder, SettlementRecord } from "../data-generator/types";
import { scoreCandidate } from "./candidateMatcher";

export interface DuplicateReferenceGroup {
  utr: string;
  settlements: SettlementRecord[];
  orderIds: string[];
}

export function findDuplicateUtrs(
  orders: readonly MerchantOrder[],
  settlements: readonly SettlementRecord[]
): DuplicateReferenceGroup[] {
  const ordersById = new Map(orders.map((order) => [order.order_id, order]));
  const rowsByUtr = new Map<string, SettlementRecord[]>();
  for (const settlement of settlements) {
    const rows = rowsByUtr.get(settlement.utr) ?? [];
    rows.push(settlement);
    rowsByUtr.set(settlement.utr, rows);
  }

  return [...rowsByUtr.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([utr, rows]) => {
      const claimedOrders = new Set<string>();
      for (const row of rows) {
        if (row.linked_order_id && ordersById.has(row.linked_order_id)) {
          claimedOrders.add(row.linked_order_id);
          continue;
        }
        const fallback = orders
          .map((order) => scoreCandidate(order, row))
          .filter(
            (candidate) =>
              !candidate.signals.includes("LINKED_ORDER_ID_CONFLICT") &&
              candidate.settlementLagWorkingDays >= 1 &&
              candidate.settlementLagWorkingDays <= 5 &&
              !claimedOrders.has(candidate.order.order_id)
          )
          .sort(
            (left, right) =>
              right.score - left.score ||
              Math.abs(left.amountDifference) - Math.abs(right.amountDifference) ||
              left.order.order_id.localeCompare(right.order.order_id)
          )[0];
        if (fallback && fallback.score >= 20) claimedOrders.add(fallback.order.order_id);
      }
      return { utr, settlements: [...rows], orderIds: [...claimedOrders].sort() };
    })
    .sort((left, right) => left.utr.localeCompare(right.utr));
}
