import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExplanationClient } from "./ai/types";
import { startServer } from "./server/app";
import { FinanceControllerService } from "./server/reconciliationService";

export interface DemoOptions {
  dataDirectory?: string;
  records?: number;
  seed?: number;
  startServerAfter?: boolean;
  explanationClient?: ExplanationClient | null;
}

function heading(title: string): void {
  console.log(`\n${title}\n${"-".repeat(40)}`);
}

export async function runDemo(options: DemoOptions = {}): Promise<void> {
  const dataDirectory = path.resolve(options.dataDirectory ?? path.join(process.cwd(), "data"));
  const records = options.records ?? 100;
  const seed = options.seed ?? 42;
  const service = new FinanceControllerService({
    dataDirectory,
    explanationClient: options.explanationClient
  });

  console.log("========================================");
  console.log("THIRDWATCH — AI FINANCE CONTROLLER");
  console.log("========================================");
  await service.generate(records, seed);
  const [ledger, settlements, groundTruth] = await Promise.all([
    readFile(path.join(dataDirectory, "merchant_ledger.csv"), "utf8"),
    readFile(path.join(dataDirectory, "settlement_report.csv"), "utf8"),
    readFile(path.join(dataDirectory, "ground_truth.json"), "utf8")
  ]);

  heading("Dataset");
  console.log(`Records: ${records}`);
  console.log(`Seed: ${seed}`);
  heading("Source A sample (first 5 orders)");
  console.log(ledger.trim().split("\n").slice(0, 6).join("\n"));
  heading("Source B sample (first 5 settlements)");
  console.log(settlements.trim().split("\n").slice(0, 6).join("\n"));
  heading("Ground truth sample (first 5 orders)");
  console.log(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(groundTruth)).slice(0, 5)), null, 2));

  const output = await service.reconcile();
  const { summary } = output;
  heading("Reconciliation");
  console.log(`Exact matches:          ${summary.exact_matches}`);
  console.log(`Fee-adjusted:           ${summary.fee_adjusted_matches}`);
  console.log(`Delayed settlements:    ${summary.delayed_settlements}`);
  console.log(`Possible refunds:       ${summary.possible_refunds}`);
  console.log(`Missing settlements:    ${summary.missing_settlements}`);
  console.log(`Duplicate references:   ${summary.duplicate_references}`);
  console.log(`Reconciled:             ${summary.total_reconciled} (${summary.overall_match_rate}%)`);
  console.log(`Unresolved exceptions:  ${summary.unresolved_exceptions} (${summary.exception_rate}%)`);

  heading("Accuracy");
  console.log(`Classification accuracy: ${summary.classification_accuracy}%`);
  console.log(`Match precision:          ${summary.match_precision}%`);
  console.log(`Match recall:             ${summary.match_recall}%`);
  console.log(`False matches:            ${summary.false_matches}`);
  console.log(`False exceptions:         ${summary.false_exceptions}`);

  heading("Performance");
  console.log(`Deterministic time: ${summary.deterministic_processing_time_ms.toFixed(2)} ms`);
  console.log(`Claude time:        ${summary.llm_time_ms.toFixed(2)} ms`);
  console.log(`Total time:         ${summary.total_processing_time_ms.toFixed(2)} ms`);
  console.log(`Throughput:         ${summary.records_per_second.toFixed(2)} records/sec`);
  console.log("========================================");

  if (options.startServerAfter !== false) {
    console.log("Dashboard: http://127.0.0.1:3001");
    console.log("Press Ctrl+C to stop the demo server.");
    startServer({ dataDirectory });
  }
}

if (require.main === module) {
  runDemo({ startServerAfter: process.env.DEMO_NO_SERVER !== "1" }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
