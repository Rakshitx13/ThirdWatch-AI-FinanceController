import { AuditEntry, ReconciliationResult, Summary } from "../types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error?.message ?? `Request failed with status ${response.status}.`, response.status);
  }
  return payload as T;
}

export const api = {
  getReport: () => requestJson<Summary>("/api/report"),
  getExceptions: () =>
    requestJson<{ count: number; exceptions: ReconciliationResult[] }>("/api/exceptions"),
  getAudit: () => requestJson<{ count: number; audit: AuditEntry[] }>("/api/audit"),
  generate: (records = 100, seed = 42) =>
    requestJson<{ success: boolean; records: number; seed: number }>("/api/generate", {
      method: "POST",
      body: JSON.stringify({ records, seed })
    }),
  reconcile: () =>
    requestJson<{ success: boolean; run_id: string; summary: Summary }>("/api/reconcile", {
      method: "POST"
    })
};
