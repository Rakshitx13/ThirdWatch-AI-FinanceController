import { performance } from "node:perf_hooks";
import { buildAmbiguityPrompt } from "./prompts";
import {
  AmbiguityEvidence,
  ExplainAmbiguityInput,
  ExplanationClient,
  LlmErrorCode,
  LlmExplanationResult
} from "./types";

/** Application-level deadline also protects against a custom or stalled client implementation. */
export const EXPLANATION_DEADLINE_MS = 8_500;

export function shouldConsultLlm(input: ExplainAmbiguityInput): boolean {
  return (
    input.result.status === "POSSIBLE_REFUND" ||
    input.result.status === "DUPLICATE_REFERENCE" ||
    (input.result.status === "NO_SETTLEMENT_FOUND" && input.result.candidateIds.length > 1)
  );
}

export function buildAmbiguityEvidence(input: ExplainAmbiguityInput): AmbiguityEvidence {
  const { result } = input;
  return {
    order: { ...input.order },
    deterministic_result: {
      status: result.status,
      reconciled: result.reconciled,
      confidence: result.confidence,
      reason: result.reason,
      expectedSettlement: result.expectedSettlement,
      actualSettlement: result.actualSettlement,
      amountDifference: result.amountDifference,
      unexplainedShortfall: result.unexplainedShortfall,
      settlementLagWorkingDays: result.settlementLagWorkingDays
    },
    candidate_settlements: input.candidates.map((candidate) => ({
      ...candidate.settlement,
      candidate_score: candidate.score,
      candidate_signals: [...candidate.signals],
      calculated_expected_settlement: candidate.expectedSettlement,
      calculated_difference: candidate.amountDifference,
      calculated_lag_working_days: candidate.settlementLagWorkingDays
    }))
  };
}

function normalizeErrorCode(error: unknown): LlmErrorCode {
  const candidate = error as { status?: number; name?: string; message?: string };
  if (candidate?.message === "ANTHROPIC_EMPTY_RESPONSE") return "EMPTY_RESPONSE";
  if (candidate?.message === "LLM_EXPLANATION_TIMEOUT" || candidate?.name === "AbortError") {
    return "TIMEOUT";
  }
  if (candidate?.status === 429 || candidate?.name === "RateLimitError") return "RATE_LIMIT";
  return "API_ERROR";
}

async function withDeadline<T>(operation: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM_EXPLANATION_TIMEOUT")), deadlineMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function explainAmbiguity(
  input: ExplainAmbiguityInput,
  client: ExplanationClient | null,
  options: { deadlineMs?: number } = {}
): Promise<LlmExplanationResult> {
  if (!shouldConsultLlm(input)) {
    return {
      llm_explanation: null,
      llm_status: "NOT_REQUIRED",
      llm_error_code: null,
      llm_time_ms: 0
    };
  }
  if (!client) {
    return {
      llm_explanation: null,
      llm_status: "UNAVAILABLE",
      llm_error_code: "MISSING_CONFIGURATION",
      llm_time_ms: 0
    };
  }

  const started = performance.now();
  try {
    const evidence = buildAmbiguityEvidence(input);
    const explanation = await withDeadline(
      client.requestExplanation(buildAmbiguityPrompt(evidence)),
      options.deadlineMs ?? EXPLANATION_DEADLINE_MS
    );
    return {
      llm_explanation: explanation,
      llm_status: "AVAILABLE",
      llm_error_code: null,
      llm_time_ms: Math.round((performance.now() - started) * 100) / 100
    };
  } catch (error) {
    return {
      llm_explanation: null,
      llm_status: "UNAVAILABLE",
      llm_error_code: normalizeErrorCode(error),
      llm_time_ms: Math.round((performance.now() - started) * 100) / 100
    };
  }
}
