import { explainAmbiguity } from "../ai/explainAmbiguity";
import { ExplanationClient } from "../ai/types";
import { discoverCandidates } from "../matching-engine/candidateMatcher";
import { reconcileBatch } from "../matching-engine/classifier";
import { baseOrder, makeCandidate } from "./matchingFixtures";

function refundInput() {
  const settlement = makeCandidate(-50).settlement;
  const [result] = reconcileBatch([baseOrder], [settlement]);
  return {
    order: baseOrder,
    result,
    candidates: discoverCandidates(baseOrder, [settlement])
  };
}

describe("ambiguity explanation orchestration", () => {
  test("returns a separate explanation without mutating deterministic classification", async () => {
    const input = refundInput();
    const immutableResult = JSON.stringify(input.result);
    const client: ExplanationClient = {
      requestExplanation: jest.fn().mockResolvedValue(
        "The ₹50 shortfall exceeds configured tolerance, but its cause is not proven. Verify the gateway refund record."
      )
    };
    const output = await explainAmbiguity(input, client);
    expect(output.llm_status).toBe("AVAILABLE");
    expect(output.llm_explanation).toContain("cause is not proven");
    expect(output.llm_error_code).toBeNull();
    expect(input.result.status).toBe("POSSIBLE_REFUND");
    expect(JSON.stringify(input.result)).toBe(immutableResult);
    expect(client.requestExplanation).toHaveBeenCalledWith(
      expect.stringContaining('"status": "POSSIBLE_REFUND"')
    );
    expect(client.requestExplanation).toHaveBeenCalledWith(
      expect.stringContaining("Do not output a new classification")
    );
  });

  test("does not consult Claude for an unambiguous exact match", async () => {
    const settlement = makeCandidate(0).settlement;
    const [result] = reconcileBatch([baseOrder], [settlement]);
    const client: ExplanationClient = { requestExplanation: jest.fn() };
    const output = await explainAmbiguity(
      { order: baseOrder, result, candidates: discoverCandidates(baseOrder, [settlement]) },
      client
    );
    expect(output).toEqual({
      llm_explanation: null,
      llm_status: "NOT_REQUIRED",
      llm_error_code: null,
      llm_time_ms: 0
    });
    expect(client.requestExplanation).not.toHaveBeenCalled();
  });

  test("continues with UNAVAILABLE when the API key/client is missing", async () => {
    await expect(explainAmbiguity(refundInput(), null)).resolves.toEqual({
      llm_explanation: null,
      llm_status: "UNAVAILABLE",
      llm_error_code: "MISSING_CONFIGURATION",
      llm_time_ms: 0
    });
  });

  test("handles API and rate-limit failures without changing the result", async () => {
    const input = refundInput();
    const apiFailure = await explainAmbiguity(input, {
      requestExplanation: jest.fn().mockRejectedValue(new Error("upstream unavailable"))
    });
    expect(apiFailure.llm_status).toBe("UNAVAILABLE");
    expect(apiFailure.llm_error_code).toBe("API_ERROR");
    expect(apiFailure.llm_explanation).toBeNull();

    const rateLimit = await explainAmbiguity(input, {
      requestExplanation: jest.fn().mockRejectedValue({ status: 429, name: "RateLimitError" })
    });
    expect(rateLimit.llm_status).toBe("UNAVAILABLE");
    expect(rateLimit.llm_error_code).toBe("RATE_LIMIT");
    expect(input.result.status).toBe("POSSIBLE_REFUND");
  });

  test("enforces an application deadline for a stalled client", async () => {
    const neverResolves: ExplanationClient = {
      requestExplanation: jest.fn().mockReturnValue(new Promise<string>(() => undefined))
    };
    const output = await explainAmbiguity(refundInput(), neverResolves, { deadlineMs: 5 });
    expect(output.llm_status).toBe("UNAVAILABLE");
    expect(output.llm_error_code).toBe("TIMEOUT");
    expect(output.llm_explanation).toBeNull();
  });

  test("maps an empty Anthropic response to UNAVAILABLE", async () => {
    const output = await explainAmbiguity(refundInput(), {
      requestExplanation: jest.fn().mockRejectedValue(new Error("ANTHROPIC_EMPTY_RESPONSE"))
    });
    expect(output.llm_status).toBe("UNAVAILABLE");
    expect(output.llm_error_code).toBe("EMPTY_RESPONSE");
  });
});
