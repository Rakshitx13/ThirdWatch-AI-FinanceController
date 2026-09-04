export interface OperationalMetrics {
  records_processed_total: number;
  records_matched_total: number;
  records_exception_total: number;
  jobs_completed_total: number;
  jobs_failed_total: number;
  job_duration_seconds: number;
}

const metrics: OperationalMetrics = {
  records_processed_total: 0,
  records_matched_total: 0,
  records_exception_total: 0,
  jobs_completed_total: 0,
  jobs_failed_total: 0,
  job_duration_seconds: 0
};

type LogLevel = "info" | "warn" | "error";

export function logOperationalEvent(
  level: LogLevel,
  event: string,
  details: Record<string, string | number | boolean> = {}
): void {
  if (process.env.NODE_ENV === "test") return;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "ThirdWatch",
    event,
    ...details
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

export function recordJobCompleted(input: {
  processed: number;
  matched: number;
  exceptions: number;
  durationSeconds: number;
}): void {
  metrics.records_processed_total += input.processed;
  metrics.records_matched_total += input.matched;
  metrics.records_exception_total += input.exceptions;
  metrics.jobs_completed_total += 1;
  metrics.job_duration_seconds = input.durationSeconds;
}

export function recordJobFailed(): void {
  metrics.jobs_failed_total += 1;
}

export function getOperationalMetrics(): OperationalMetrics {
  return { ...metrics };
}
