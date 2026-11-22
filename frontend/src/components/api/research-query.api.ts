/**
 * Research Query API Client
 * Connects frontend research workspace to backend route: POST /api/research-query
 */

import { AUTH_API_BASE_URL, fetchapi } from "./fetchapi";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ResearchPlanStep {
  id: string;
  title: string;
  description?: string;
  dependsOn?: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  outputSnippet?: string;
  result?: string;
  updatedAt?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchQueryParams {
  query?: string;
  sessionId?: string;
  pastedText?: string;
  document?: File | null;
  conversationHistory?: ChatMessage[];
  action?: "generate_plan" | "edit_plan" | "approve_plan";
  userPlanEdits?: string;
  researchPlan?: ResearchPlanStep[];
}

export interface ResearchQueryData {
  sessionId?: string;
  mode?: string;
  query?: string | null;
  answer?: string;
  planApprovalStatus?: "awaiting_approval" | "edit_requested" | "approved";
  planIterationCount?: number;
  conversationHistory?: ChatMessage[];
  researchPlan?: ResearchPlanStep[];
  searchResults?: WebSearchResult[];
  retrievedChunks?: string[];
  totalChunks?: number;
  retrievedChunksCount?: number;
  documentFile?: string;
  pastedTextId?: string;
  [key: string]: unknown;
}

/**
 * Standard backend success payload shape
 */
export interface BackendSuccessPayload {
  success: true;
  message: string;
  data: ResearchQueryData;
}

/**
 * Standard backend failure payload shape
 */
export interface BackendFailurePayload {
  success: false;
  message: string;
  errors?: unknown;
}

/**
 * Unified return type for frontend consumers
 * Discriminant: `success: true` | `success: false`
 */
export type ResearchQueryResult =
  | {
      success: true;
      message: string;
      data: ResearchQueryData;
      statusCode: number;
    }
  | {
      success: false;
      message: string;
      errors?: unknown;
      statusCode?: number;
    };

/**
 * Execute research query against backend route POST /api/research-query.
 * Handles both JSON payload and Multipart FormData (when document is attached).
 * Gracefully handles both success and failure cases with strict typing.
 */
export async function executeResearchQuery(
  params: ResearchQueryParams,
  signal?: AbortSignal
): Promise<ResearchQueryResult> {
  const {
    query,
    sessionId,
    pastedText,
    document,
    conversationHistory = [],
    action,
    userPlanEdits,
    researchPlan,
  } = params;

  const cleanQuery = query?.trim();
  const cleanPastedText = pastedText?.trim();
  const cleanUserEdits = userPlanEdits?.trim();

  // Guard: validate that at least one input or plan is provided
  if (!cleanQuery && !document && !cleanPastedText && !researchPlan?.length) {
    return {
      success: false,
      message: "Please provide a search query, a document, or pasted text.",
      statusCode: 400,
    };
  }

  const endpoint = `${AUTH_API_BASE_URL}/api/research-query`;

  try {
    let response: Response;

    // When a document is attached, send as multipart/form-data via FormData
    if (document instanceof File) {
      const formData = new FormData();
      if (cleanQuery) formData.append("query", cleanQuery);
      if (sessionId) formData.append("sessionId", sessionId);
      if (cleanPastedText) formData.append("pastedText", cleanPastedText);
      if (action) formData.append("action", action);
      if (cleanUserEdits) formData.append("userPlanEdits", cleanUserEdits);
      if (researchPlan && researchPlan.length > 0) {
        formData.append("researchPlan", JSON.stringify(researchPlan));
      }
      formData.append("document", document);

      if (conversationHistory.length > 0) {
        formData.append(
          "conversationHistory",
          JSON.stringify(conversationHistory)
        );
      }

      response = await fetchapi(endpoint, {
        method: "POST",
        body: formData,
        signal,
      });
    } else {
      // Pure query / text request, send as application/json
      const jsonBody: Record<string, unknown> = {};
      if (cleanQuery) jsonBody.query = cleanQuery;
      if (sessionId) jsonBody.sessionId = sessionId;
      if (cleanPastedText) jsonBody.pastedText = cleanPastedText;
      if (action) jsonBody.action = action;
      if (cleanUserEdits) jsonBody.userPlanEdits = cleanUserEdits;
      if (researchPlan && researchPlan.length > 0) {
        jsonBody.researchPlan = researchPlan;
      }
      if (conversationHistory.length > 0) {
        jsonBody.conversationHistory = conversationHistory;
      }

      response = await fetchapi(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(jsonBody),
        signal,
      });
    }

    // Try parsing response as JSON
    const contentType = response.headers.get("content-type") || "";
    let responseData: any = null;

    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = { message: text };
      }
    }

    // Handle Success Case
    if (response.ok && responseData?.success !== false) {
      return {
        success: true,
        message:
          responseData?.message || "Research query processed successfully.",
        data: (responseData?.data || responseData) as ResearchQueryData,
        statusCode: response.status,
      };
    }

    // Handle HTTP Error / Backend Failure Case
    const errorMessage =
      responseData?.message ||
      responseData?.error ||
      `Request failed with status ${response.status}`;

    return {
      success: false,
      message: errorMessage,
      errors: responseData?.errors ?? responseData,
      statusCode: response.status,
    };
  } catch (error: unknown) {
    // Handle Network, Timeout, or Abort Errors
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        success: false,
        message: "Research query request was canceled.",
      };
    }

    const networkErrorMessage =
      error instanceof Error
        ? error.message
        : "Network error: Unable to connect to the research server. Please ensure the backend is running on port 8000.";

    return {
      success: false,
      message: networkErrorMessage,
      errors: error,
    };
  }
}
