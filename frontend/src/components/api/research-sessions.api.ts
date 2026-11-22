import { API_BASE_URL, fetchapi } from "./fetchapi";

export interface ResearchSessionSummary {
  id: string;
  title: string;
  displayName: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSessionMessage {
  id: string;
  sequence: number;
  role: "user" | "assistant" | "tool";
  content: string;
  planVersionId: string | null;
  sources: {
    sourceId: string;
    title: string;
    url?: string;
    snippet?: string;
  }[];
  createdAt: string;
}

export interface ResearchSessionPlan {
  id: string;
  version: number;
  status: "draft" | "pending_approval" | "approved" | "superseded" | "rejected";
  createdAt: string;
  approvedAt: string | null;
  plan: {
    title: string;
    objective: string;
    steps: { id: string; title: string; description: string }[];
  };
}

export interface ResearchSessionDetail {
  session: ResearchSessionSummary;
  messages: ResearchSessionMessage[];
  plans: ResearchSessionPlan[];
}

interface SessionListResponse {
  sessions: ResearchSessionSummary[];
  total: number;
  page: number;
  limit: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function requestData<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetchapi(url, options);
  const payload: unknown = await response.json();

  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  if (!("data" in payload)) {
    throw new Error("The server returned an invalid session response.");
  }

  return payload.data as T;
}

export function listResearchSessions(
  options: { page?: number; limit?: number; search?: string } = {},
  signal?: AbortSignal,
): Promise<SessionListResponse> {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.search?.trim()) params.set("search", options.search.trim());

  const queryString = params.toString();
  const query = queryString ? `?${queryString}` : "";
  return requestData(`${API_BASE_URL}/api/research-sessions${query}`, {
    method: "GET",
    signal,
  });
}

export function getResearchSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ResearchSessionDetail> {
  return requestData(
    `${API_BASE_URL}/api/research-sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET", signal },
  );
}

export function renameResearchSession(
  sessionId: string,
  title: string,
): Promise<ResearchSessionSummary> {
  if (!sessionId) {
    throw new Error("Session ID is required to rename a research session.");
  }

  if (!title || !title.trim()) {
    throw new Error("A non-empty title is required to rename a research session.");
  }

  return requestData(
    `${API_BASE_URL}/api/research-sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
}

export function deleteResearchSession(sessionId: string): Promise<{ id: string }> {
  if (!sessionId) {
    throw new Error("Session ID is required to delete a research session.");
  }

  return requestData(
    `${API_BASE_URL}/api/research-sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}
