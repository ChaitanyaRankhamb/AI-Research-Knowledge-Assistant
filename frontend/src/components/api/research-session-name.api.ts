import { AUTH_API_BASE_URL, fetchapi } from "./fetchapi";

export type ResearchSessionNameResult =
  | { success: true; generatedName: string }
  | { success: false; message: string };

export async function generateResearchSessionName(
  sessionId: string,
): Promise<ResearchSessionNameResult> {
  try {
    const response = await fetchapi(
      `${AUTH_API_BASE_URL}/api/research-session-name`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal: AbortSignal.timeout(60000),
      },
    );
    const payload: unknown = await response.json();

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : `Name generation failed (${response.status}).`;
      return { success: false, message };
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("data" in payload) ||
      typeof payload.data !== "object" ||
      payload.data === null ||
      !("generatedName" in payload.data) ||
      typeof payload.data.generatedName !== "string" ||
      !payload.data.generatedName.trim()
    ) {
      return {
        success: false,
        message: "The server returned an invalid session name.",
      };
    }

    return {
      success: true,
      generatedName: payload.data.generatedName.trim(),
    };
  } catch (error: unknown) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to generate a research session name.",
    };
  }
}
