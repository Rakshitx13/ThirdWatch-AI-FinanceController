"use strict";

const { lstat, readdir, rm } = require("node:fs/promises");
const path = require("node:path");

const ALLOWED_FILES = new Set([
  "merchant_ledger.csv",
  "settlement_report.csv",
  "ground_truth.json",
  "reconciliation_result.json",
  "audit_trail.json",
  "summary.json",
  "accuracy_report.json",
  "exception_report.json"
]);

function parseArguments(argv) {
  let days;
  let execute = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--days") days = Number(argv[++index]);
    else if (argument === "--execute") execute = true;
    else if (argument === "--dry-run") execute = false;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be an integer of at least 1.");
  return { days, execute };
}

async function main() {
  const { days, execute } = parseArguments(process.argv.slice(2));
  const projectDirectory = path.resolve(__dirname, "..");
  const dataDirectory = path.join(projectDirectory, "data");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1_000;
  const entries = await readdir(dataDirectory, { withFileTypes: true });
  let eligible = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !ALLOWED_FILES.has(entry.name)) continue;
    const filePath = path.join(dataDirectory, entry.name);
    if (path.dirname(filePath) !== dataDirectory) throw new Error("Cleanup target escaped the ThirdWatch data directory.");
    const metadata = await lstat(filePath);
    if (metadata.isSymbolicLink() || metadata.mtimeMs > cutoff) continue;
    eligible += 1;
    console.log(`${execute ? "DELETE" : "DRY-RUN"} ${entry.name}`);
    if (execute) await rm(filePath);
  }

  console.log(`${execute ? "Deleted" : "Would delete"} ${eligible} approved data artifact(s) older than ${days} day(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
