import { createAuditEntry } from "../audit/auditWriter";
import { generateDataset } from "../data-generator/generator";
import { reconcileBatch } from "../matching-engine/classifier";

describe("audit trail", () => {
  test("creates exactly one reconstructable audit record per input order", () => {
    const dataset = generateDataset(100, 42);
    const results = reconcileBatch(dataset.merchantLedger, dataset.settlementReport);
    const entries = results.map((result) =>
      createAuditEntry(
        result,
        {
          llm_explanation: null,
          llm_status: "UNAVAILABLE",
          llm_error_code: "MISSING_CONFIGURATION",
          llm_time_ms: 0
        },
        "2026-08-31T00:00:00.000Z"
      )
    );
    expect(entries).toHaveLength(dataset.merchantLedger.length);
    expect(new Set(entries.map((entry) => entry.order_id)).size).toBe(dataset.merchantLedger.length);
    for (const entry of entries) {
      expect(entry.rule_fired).toBe(entry.classification);
      expect(entry.rules_evaluated.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(typeof entry.reconciled).toBe("boolean");
      expect(entry.llm_explanation).toBeNull();
    }
  });
});
