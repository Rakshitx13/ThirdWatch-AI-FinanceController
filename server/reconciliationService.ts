import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ExplanationClient } from "../ai/types";
import { writeJsonAtomically } from "../audit/auditWriter";
import { AuditEntry } from "../audit/auditWriter";
import { serializeMerchantLedger, serializeSettlementReport } from "../data-generator/csv";
import { DEFAULT_BATCH_SIZE, DEFAULT_SEED, generateDataset } from "../data-generator/generator";
import { createExceptionReport } from "../reporting/exceptionReport";
import {
  PersistedReconciliationResult,
  PipelineOutput,
  runReconciliationPipeline
} from "../reporting/runPipeline";
import { ReconciliationSummary } from "../reporting/summary";
import { logOperationalEvent, recordJobCompleted, recordJobFailed } from "./observability";

const DERIVED_FILES = [
  "reconciliation_result.json",
  "audit_trail.json",
  "summary.json",
  "accuracy_report.json",
  "exception_report.json"
] as const;

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

async function writeTextAtomically(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}

export interface FinanceControllerServiceOptions {
  dataDirectory?: string;
  explanationClient?: ExplanationClient | null;
}

export class FinanceControllerService {
  readonly dataDirectory: string;
  private readonly explanationClient: ExplanationClient | null | undefined;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(options: FinanceControllerServiceOptions = {}) {
    this.dataDirectory = path.resolve(options.dataDirectory ?? path.join(process.cwd(), "data"));
    this.explanationClient = options.explanationClient;
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async generate(records = DEFAULT_BATCH_SIZE, seed = DEFAULT_SEED): Promise<{ records: number; seed: number }> {
    return this.runExclusive(async () => {
      logOperationalEvent("info", "dataset_generation_started", { records, seed });
      try {
        const dataset = generateDataset(records, seed);
        await Promise.all([
          writeTextAtomically(
            path.join(this.dataDirectory, "merchant_ledger.csv"),
            serializeMerchantLedger(dataset.merchantLedger)
          ),
          writeTextAtomically(
            path.join(this.dataDirectory, "settlement_report.csv"),
            serializeSettlementReport(dataset.settlementReport)
          ),
          writeJsonAtomically(path.join(this.dataDirectory, "ground_truth.json"), dataset.groundTruth)
        ]);
        // Derived reports describe the previous source batch and must not survive regeneration.
        await Promise.all(
          DERIVED_FILES.map((filename) => rm(path.join(this.dataDirectory, filename), { force: true }))
        );
        logOperationalEvent("info", "dataset_generation_completed", { records, seed });
        return { records, seed };
      } catch (error) {
        recordJobFailed();
        logOperationalEvent("error", "dataset_generation_failed", {
          error_type: error instanceof Error ? error.name : "UnknownError"
        });
        throw error;
      }
    });
  }

  async reconcile(): Promise<PipelineOutput> {
    return this.runExclusive(async () => {
      const startedAt = performance.now();
      logOperationalEvent("info", "reconciliation_started");
      try {
        const output = await runReconciliationPipeline({
          dataDirectory: this.dataDirectory,
          explanationClient: this.explanationClient
        });
        const durationSeconds = (performance.now() - startedAt) / 1_000;
        recordJobCompleted({
          processed: output.summary.total_records,
          matched: output.summary.total_reconciled,
          exceptions: output.summary.unresolved_exceptions,
          durationSeconds
        });
        logOperationalEvent("info", "reconciliation_completed", {
          records_processed: output.summary.total_records,
          records_matched: output.summary.total_reconciled,
          records_exception: output.summary.unresolved_exceptions,
          duration_seconds: Number(durationSeconds.toFixed(6))
        });
        return output;
      } catch (error) {
        recordJobFailed();
        logOperationalEvent("error", "reconciliation_failed", {
          error_type: error instanceof Error ? error.name : "UnknownError"
        });
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new ServiceError(
            "Source dataset is not available. Generate a dataset first.",
            400,
            "DATASET_NOT_FOUND"
          );
        }
        throw error;
      }
    });
  }

  private async readJson<T>(filename: string): Promise<T> {
    try {
      return JSON.parse(await readFile(path.join(this.dataDirectory, filename), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ServiceError(
          `${filename} is not available. Generate and reconcile a dataset first.`,
          404,
          "REPORT_NOT_FOUND"
        );
      }
      if (error instanceof SyntaxError) {
        throw new ServiceError(`${filename} contains invalid JSON.`, 500, "INVALID_REPORT_FILE");
      }
      throw error;
    }
  }

  getReport(): Promise<ReconciliationSummary> {
    return this.readJson<ReconciliationSummary>("summary.json");
  }

  getAuditTrail(): Promise<AuditEntry[]> {
    return this.readJson<AuditEntry[]>("audit_trail.json");
  }

  async getExceptions(options: { type?: string; search?: string }): Promise<PersistedReconciliationResult[]> {
    const results = await this.readJson<PersistedReconciliationResult[]>("reconciliation_result.json");
    return createExceptionReport(results, options) as PersistedReconciliationResult[];
  }
}
