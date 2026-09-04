import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeMerchantLedger, serializeSettlementReport } from "./csv";
import { DEFAULT_BATCH_SIZE, DEFAULT_SEED, generateDataset } from "./generator";

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

async function main(): Promise<void> {
  const seed = parseInteger(process.env.SEED, DEFAULT_SEED, "SEED");
  const size = parseInteger(process.env.BATCH_SIZE, DEFAULT_BATCH_SIZE, "BATCH_SIZE");
  const dataset = generateDataset(size, seed);
  const outputDirectory = path.resolve(process.cwd(), "data");
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "merchant_ledger.csv"), serializeMerchantLedger(dataset.merchantLedger), "utf8"),
    writeFile(path.join(outputDirectory, "settlement_report.csv"), serializeSettlementReport(dataset.settlementReport), "utf8"),
    writeFile(path.join(outputDirectory, "ground_truth.json"), `${JSON.stringify(dataset.groundTruth, null, 2)}\n`, "utf8")
  ]);

  console.log(`Generated ${size} records with seed ${seed}.`);
  console.log(`Merchant ledger: ${path.join(outputDirectory, "merchant_ledger.csv")}`);
  console.log(`Settlement report: ${path.join(outputDirectory, "settlement_report.csv")}`);
  console.log(`Ground truth: ${path.join(outputDirectory, "ground_truth.json")}`);
  console.log("Distribution:", dataset.distribution);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
