import {
  ANTHROPIC_MAX_TOKENS,
  AnthropicExplanationClient,
  createAnthropicExplanationClient
} from "../ai/anthropicClient";
import { AMBIGUITY_SYSTEM_PROMPT } from "../ai/prompts";

describe("Anthropic explanation client", () => {
  test("calls the mocked Messages API with a constrained request", async () => {
    const create = jest.fn().mockResolvedValue({
      content: [
        { type: "text", text: "The settlement is below the expected amount." },
        { type: "tool_use", id: "ignored" },
        { type: "text", text: "Finance should verify the gateway refund record." }
      ]
    });
    const client = new AnthropicExplanationClient(
      { apiKey: "test-key", model: "test-model" },
      { messages: { create } }
    );

    await expect(client.requestExplanation("structured evidence")).resolves.toBe(
      "The settlement is below the expected amount. Finance should verify the gateway refund record."
    );
    expect(create).toHaveBeenCalledWith({
      model: "test-model",
      max_tokens: ANTHROPIC_MAX_TOKENS,
      temperature: 0,
      system: AMBIGUITY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: "structured evidence" }]
    });
  });

  test("rejects an empty text response", async () => {
    const client = new AnthropicExplanationClient(
      { apiKey: "test-key", model: "test-model" },
      { messages: { create: jest.fn().mockResolvedValue({ content: [{ type: "text", text: " " }] }) } }
    );
    await expect(client.requestExplanation("evidence")).rejects.toThrow("ANTHROPIC_EMPTY_RESPONSE");
  });

  test("does not create a client when environment configuration is incomplete", () => {
    expect(createAnthropicExplanationClient({})).toEqual({
      client: null,
      unavailableReason: "ANTHROPIC_API_KEY is not configured."
    });
    expect(createAnthropicExplanationClient({ ANTHROPIC_API_KEY: "key" })).toEqual({
      client: null,
      unavailableReason: "ANTHROPIC_MODEL is not configured."
    });
    const configured = createAnthropicExplanationClient({
      ANTHROPIC_API_KEY: "key",
      ANTHROPIC_MODEL: "model"
    });
    expect(configured.client).toBeInstanceOf(AnthropicExplanationClient);
    expect(configured.unavailableReason).toBeNull();
  });
});
