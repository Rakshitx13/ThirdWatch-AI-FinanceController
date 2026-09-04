import { ReconciliationResult } from "../matching-engine/types";

export function createExceptionReport(
  results: readonly ReconciliationResult[],
  options: { type?: string; search?: string } = {}
): ReconciliationResult[] {
  const search = options.search?.trim().toLowerCase();
  return results.filter((result) => {
    if (result.status === "EXACT_MATCH") return false;
    if (options.type && result.status !== options.type) return false;
    if (
      search &&
      !result.orderId.toLowerCase().includes(search) &&
      !result.reason.toLowerCase().includes(search) &&
      !result.selectedUtr?.toLowerCase().includes(search)
    ) {
      return false;
    }
    return true;
  });
}
