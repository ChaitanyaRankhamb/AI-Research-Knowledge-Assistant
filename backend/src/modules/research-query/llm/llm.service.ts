import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Configuration parameters for the LLM model.
 */
export interface LlmConfig {
  modelName: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  streaming?: boolean;
  streamUsage?: boolean;
}

/**
 * Service handling Google Gemini Chat Model integration.
 * Centralizes model instantiation, generation, and streaming for LangGraph nodes.
 */
export class LlmService {
  /**
   * Default model from environment or fallback to gemini-3.5-flash
   */
  public static readonly DEFAULT_MODEL_NAME =
    process.env.GOOGLE_GEMINI_MODEL || "gemini-3.8-flash";

  /**
   * Resilient fallback models ordered by reliability and low quota footprint
   */
  public static readonly FALLBACK_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
  ];

  /**
   * Default temperature: 0.2
   * Low temperature ensures deterministic, hallucination-resistant research analysis.
   */
  public static readonly DEFAULT_TEMPERATURE = 0.2;

  /**
   * Creates or returns a ChatGoogleGenerativeAI instance with specified configuration.
   */
  public getModel(config?: Partial<LlmConfig>): ChatGoogleGenerativeAI {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "Google Gemini API key is missing. Please set GOOGLE_GEMINI_API_KEY in your .env file.",
      );
    }

    const model = config?.modelName || LlmService.DEFAULT_MODEL_NAME;
    const temperature = config?.temperature ?? LlmService.DEFAULT_TEMPERATURE;
    const maxOutputTokens = config?.maxOutputTokens ?? 16384;
    const maxRetries = config?.maxRetries ?? 2;
    const streaming = config?.streaming ?? false;
    const streamUsage = config?.streamUsage ?? false;

    // integrate google gemini llm model
    return new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature,
      maxOutputTokens,
      maxRetries,
      streaming,
      streamUsage,
    });
  }

  /**
   * Generates a text response from the LLM given a prompt string or array of messages.
   * Transparently falls back to resilient backup models if rate limits (429) or empty outputs occur.
   *
   * @param input Plain text prompt string or array of LangChain BaseMessage objects
   * @param config Optional model configuration overrides
   * @returns String response content
   */
  public async generateResponse(
    input: string | BaseMessage[],
    config?: Partial<LlmConfig>,
  ): Promise<string> {
    const configuredModel = config?.modelName || LlmService.DEFAULT_MODEL_NAME;
    const modelsToAttempt = [
      configuredModel,
      ...LlmService.FALLBACK_MODELS.filter((m) => m !== configuredModel),
    ];

    const messages =
      typeof input === "string" ? [new HumanMessage(input)] : input;

    let lastError: unknown;

    for (const [index, candidateModel] of modelsToAttempt.entries()) {
      try {
        const model = this.getModel({ ...config, modelName: candidateModel });
        const response = await model.invoke(messages);

        let content = "";
        if (typeof response.content === "string") {
          content = response.content;
        } else if (Array.isArray(response.content)) {
          content = response.content
            .map((part: unknown) => {
              if (typeof part === "string") return part;
              if (
                typeof part === "object" &&
                part !== null &&
                "text" in part &&
                typeof (part as { text: unknown }).text === "string"
              ) {
                return (part as { text: string }).text;
              }
              return "";
            })
            .join("")
            .trim();
        } else {
          content = String(response.content ?? "");
        }

        if (content && content.trim()) {
          return content;
        }

        // Empty response content (e.g. malformed internal function call)
        throw new Error(
          `Model "${candidateModel}" returned an empty response content.`,
        );
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRecoverable =
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("quota") ||
          errMsg.toLowerCase().includes("rate limit") ||
          errMsg.toLowerCase().includes("too many requests") ||
          errMsg.includes("empty response content") ||
          errMsg.includes("MALFORMED_FUNCTION_CALL");

        if (isRecoverable && index < modelsToAttempt.length - 1) {
          const nextModel = modelsToAttempt[index + 1];
          console.warn(
            `[LlmService] Model "${candidateModel}" encountered recoverable issue (${errMsg.slice(0, 110)}...). Auto-switching to backup model "${nextModel}"...`,
          );
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Generates a strongly-typed structured output adhering to a given Zod schema.
   * Works dynamically for any node and any schema, with automatic multi-model fallback.
   *
   * @param input Plain text prompt string or array of LangChain BaseMessage objects
   * @param schema Zod schema definition for structured output
   * @param config Optional model configuration overrides
   * @returns Typed object matching the input Zod schema
   */
  public async generateStructured<T extends z.ZodTypeAny>(
    input: string | BaseMessage[],
    schema: T,
    config?: Partial<LlmConfig>,
  ): Promise<z.infer<T>> {
    const configuredModel = config?.modelName || LlmService.DEFAULT_MODEL_NAME;
    const modelsToAttempt = [
      configuredModel,
      ...LlmService.FALLBACK_MODELS.filter((m) => m !== configuredModel),
    ];

    const messages =
      typeof input === "string" ? [new HumanMessage(input)] : input;

    let lastError: unknown;

    for (const [index, candidateModel] of modelsToAttempt.entries()) {
      try {
        const model = this.getModel({ ...config, modelName: candidateModel });
        const structuredModel = model.withStructuredOutput(schema);

        const result = await structuredModel.invoke(messages);

        if (result !== undefined && result !== null) {
          return result as z.infer<T>;
        }

        throw new Error(
          `Model "${candidateModel}" returned empty structured output.`,
        );
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isRecoverable =
          errMsg.includes("429") ||
          errMsg.toLowerCase().includes("quota") ||
          errMsg.toLowerCase().includes("rate limit") ||
          errMsg.toLowerCase().includes("too many requests") ||
          errMsg.includes("empty structured output") ||
          errMsg.includes("MALFORMED_FUNCTION_CALL");

        if (isRecoverable && index < modelsToAttempt.length - 1) {
          const nextModel = modelsToAttempt[index + 1];
          console.warn(
            `[LlmService] Structured generation on "${candidateModel}" failed (${errMsg.slice(0, 110)}...). Auto-switching to backup model "${nextModel}"...`,
          );
          await new Promise((res) => setTimeout(res, 800));
          continue;
        }

        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Streams token chunks from the LLM as they are generated.
   * Useful for real-time UI streaming (Server-Sent Events).
   *
   * @param input Plain text prompt string or array of LangChain BaseMessage objects
   * @param config Optional model configuration overrides
   */
  public async *streamResponse(
    input: string | BaseMessage[],
    config?: Partial<LlmConfig>,
  ): AsyncIterable<string> {
    const model = this.getModel({ streaming: true, ...config });
    const messages =
      typeof input === "string" ? [new HumanMessage(input)] : input;

    const stream = await model.stream(messages);
    for await (const chunk of stream) {
      if (typeof chunk.content === "string") {
        yield chunk.content;
      }
    }
  }
}

export const llmService = new LlmService();
