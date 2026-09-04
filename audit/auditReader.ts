import { readFile } from "node:fs/promises";
import { AuditEntry } from "./auditWriter";

export async function readAuditTrail(filePath: string): Promise<AuditEntry[]> {
  const contents = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed)) throw new Error("Audit trail must contain a JSON array.");
  return parsed as AuditEntry[];
}
