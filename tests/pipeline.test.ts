import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { serializeMerchantLedger, serializeSettlementReport } from "../data-generator/csv";
import { generateDataset } from "../data-generator/generator";
import { runReconciliationPipeline } from "../reporting/runPipeline";

describe("complete reconciliation pipeline", () => {
  test("persists results, audit, summary, accuracy, and exceptions", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "finance-controller-"));
    try {
      const dataset = generateDataset(50, 42);
      await Promise.all([
        writeFile(path.join(directory, "merchant_ledger.csv"), serializeMerchantLedger(dataset.merchantLedger)),
        writeFile(path.join(directory, "settlement_report.csv"), serializeSettlementReport(dataset.settlementReport)),
        writeFile(path.join(directory, "ground_truth.json"), JSON.stringify(dataset.groundTruth))
      ]);
      const output = await runReconciliationPipeline({
        dataDirectory: directory,
        explanationClient: null,
        runId: "RUN-TEST",
        now: () => new Date("2026-08-31T00:00:00.000Z")
      });
      expect(output.results).toHaveLength(50);
      expect(output.auditTrail).toHaveLength(50);
      expect(output.summary.run_id).toBe("RUN-TEST");
      expect(output.summary.classification_accuracy).toBe(100);
      expect(output.summary.false_matches).toBe(0);
      expect(output.auditTrail.filter((entry) => entry.llm_consulted)).toHaveLength(0);
      expect(output.auditTrail.filter((entry) => entry.llm_status === "UNAVAILABLE").length).toBeGreaterThan(0);

      for (const filename of [
        "reconciliation_result.json",
        "audit_trail.json",
        "summary.json",
        "accuracy_report.json",
        "exception_report.json"
      ]) {
        const parsed = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
        expect(parsed).toBeDefined();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
