import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { AMBIGUITY_SYSTEM_PROMPT } from "./prompts";
import { ExplanationClient } from "./types";

/** Short explanations need a small output budget and should never become long analyses. */
export const ANTHROPIC_MAX_TOKENS = 180;
/** Bound API latency so deterministic reconciliation remains the reliable core. */
export const ANTHROPIC_TIMEOUT_MS = 8_000;

interface AnthropicSdkLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface AnthropicClientConfiguration {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface AnthropicClientFactoryResult {
  client: AnthropicExplanationClient | null;
  unavailableReason: string | null;
}

export class AnthropicExplanationClient implements ExplanationClient {
  private readonly sdk: AnthropicSdkLike;

  constructor(
    private readonly configuration: AnthropicClientConfiguration,
    sdk?: AnthropicSdkLike
  ) {
    this.sdk = sdk ?? (new Anthropic({
      apiKey: configuration.apiKey,
      timeout: configuration.timeoutMs ?? ANTHROPIC_TIMEOUT_MS,
      // The explanation is optional; SDK retries must not make finance processing wait unpredictably.
      maxRetries: 0
    }) as unknown as AnthropicSdkLike);
  }

  async requestExplanation(prompt: string): Promise<string> {
    const message = await this.sdk.messages.create({
      model: this.configuration.model,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      temperature: 0,
      system: AMBIGUITY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    });
    const explanation = message.content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join(" ")
      .trim();
    if (!explanation) throw new Error("ANTHROPIC_EMPTY_RESPONSE");
    return explanation;
  }
}

export function createAnthropicExplanationClient(
  environment: NodeJS.ProcessEnv = process.env
): AnthropicClientFactoryResult {
  const apiKey = environment.ANTHROPIC_API_KEY?.trim();
  const model = environment.ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) {
    return {
      client: null,
      unavailableReason: !apiKey
        ? "ANTHROPIC_API_KEY is not configured."
        : "ANTHROPIC_MODEL is not configured."
    };
  }
  return {
    client: new AnthropicExplanationClient({ apiKey, model }),
    unavailableReason: null
  };
}
