/**
 * Unified API Error Handler & Logging Utility
 * Parses errors from Google Gemini, Tavily Search, Qdrant, and LangGraph nodes,
 * extracting exact HTTP status codes (e.g., 429 Rate Limit, 503 Service Unavailable)
 * and detailed diagnostic messages instead of masking them behind generic 500 errors.
 */

export interface FormattedApiError {
  service: "GoogleGemini" | "Tavily" | "Qdrant" | "Embedding" | "LangGraph" | "System";
  node?: string;
  statusCode: number;
  message: string;
  isRateLimit: boolean;
  details?: unknown;
  originalError?: unknown;
}

export class WorkflowError extends Error {
  public readonly service: FormattedApiError["service"];
  public readonly statusCode: number;
  public readonly isRateLimit: boolean;
  public readonly node?: string;
  public readonly details?: unknown;

  constructor(formatted: FormattedApiError) {
    super(formatted.message);
    this.name = "WorkflowError";
    this.service = formatted.service;
    this.statusCode = formatted.statusCode;
    this.isRateLimit = formatted.isRateLimit;
    this.node = formatted.node;
    this.details = formatted.details;
  }
}

/**
 * Parses any caught error object (from LangChain, Google SDK, Tavily, Qdrant, or Express)
 * into a structured FormattedApiError.
 */
export function parseApiError(error: unknown, contextNode?: string): FormattedApiError {
  let statusCode = 500;
  let message = "An internal server error occurred.";
  let details: unknown = undefined;
  let service: FormattedApiError["service"] = "System";
  let isRateLimit = false;

  if (error instanceof WorkflowError) {
    return {
      service: error.service,
      node: error.node || contextNode,
      statusCode: error.statusCode,
      message: error.message,
      isRateLimit: error.isRateLimit,
      details: error.details,
      originalError: error,
    };
  }

  if (error instanceof Error) {
    message = error.message;
    const errObj = error as Record<string, any>;

    // 1. Detect explicit status code properties
    if (typeof errObj.status === "number") {
      statusCode = errObj.status;
    } else if (typeof errObj.statusCode === "number") {
      statusCode = errObj.statusCode;
    } else if (typeof errObj.response?.status === "number") {
      statusCode = errObj.response.status;
    }

    // 2. Identify the offending service
    const msgLower = message.toLowerCase();
    const nameLower = (errObj.name || "").toLowerCase();

    if (
      nameLower.includes("googlegenerativeai") ||
      msgLower.includes("googlegenerativeai") ||
      msgLower.includes("generativelanguage.googleapis.com") ||
      msgLower.includes("gemini")
    ) {
      service = "GoogleGemini";
      if (errObj.errorDetails) {
        details = errObj.errorDetails;
      }
    } else if (msgLower.includes("tavily") || nameLower.includes("tavily")) {
      service = "Tavily";
    } else if (
      msgLower.includes("qdrant") ||
      nameLower.includes("qdrant") ||
      msgLower.includes("vector")
    ) {
      service = "Qdrant";
    } else if (msgLower.includes("embedding")) {
      service = "Embedding";
    } else if (contextNode) {
      service = "LangGraph";
    }

    // 3. Detect Rate Limit / Quota Exceeded (429)
    if (
      statusCode === 429 ||
      msgLower.includes("429") ||
      msgLower.includes("quota") ||
      msgLower.includes("rate limit") ||
      msgLower.includes("resource_exhausted") ||
      msgLower.includes("exceeded your current quota") ||
      msgLower.includes("too many requests")
    ) {
      statusCode = 429;
      isRateLimit = true;
      if (!msgLower.includes("rate limit") && !msgLower.includes("quota")) {
        message = `[API Rate Limit] ${message}`;
      }
    } else if (
      statusCode === 503 ||
      msgLower.includes("503") ||
      msgLower.includes("service unavailable") ||
      msgLower.includes("high demand")
    ) {
      statusCode = 503;
      if (!msgLower.includes("service unavailable")) {
        message = `[Service Unavailable] ${message}`;
      }
    } else if (statusCode === 404 || msgLower.includes("404")) {
      statusCode = 404;
    } else if (statusCode === 400 || msgLower.includes("400")) {
      statusCode = 400;
    }
  } else if (typeof error === "string") {
    message = error;
  }

  // Ensure status code is valid HTTP error code
  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  return {
    service,
    node: contextNode,
    statusCode,
    message,
    isRateLimit,
    details,
    originalError: error,
  };
}

/**
 * Standardized logger for errors across LangGraph workflow nodes
 */
export function logWorkflowError(
  nodeName: string,
  error: unknown,
  extraContext?: Record<string, unknown>,
): FormattedApiError {
  const parsed = parseApiError(error, nodeName);

  console.error("\n" + "=".repeat(80));
  console.error(`❌ [LangGraph Workflow Error in Node: "${nodeName}"]`);
  console.error(`   Service:     ${parsed.service}`);
  console.error(`   HTTP Status: ${parsed.statusCode} ${parsed.isRateLimit ? "⚠️ (RATE LIMIT / QUOTA EXCEEDED)" : ""}`);
  console.error(`   Message:     ${parsed.message}`);
  if (extraContext && Object.keys(extraContext).length > 0) {
    console.error(`   Context:    `, JSON.stringify(extraContext, null, 2));
  }
  if (parsed.details) {
    console.error(`   Details:    `, JSON.stringify(parsed.details, null, 2));
  }
  if (error instanceof Error && error.stack) {
    console.error(`   Stack trace:`, error.stack);
  }
  console.error("=".repeat(80) + "\n");

  return parsed;
}
