"use client";

import * as React from "react";
import { AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { ResearchSidebar } from "./research-sidebar";
import { ResearchQueryBar, type AttachedDocument } from "./research-query-bar";
import { ResearchEmptyState } from "./research-empty-state";
import { useUser } from "@/context/UserContext";
import {
  executeResearchQuery,
  type ChatMessage,
  type ResearchPlanStep,
} from "@/components/api/research-query.api";
import { generateResearchSessionName } from "@/components/api/research-session-name.api";
import {
  deleteResearchSession,
  getResearchSession,
  listResearchSessions,
  renameResearchSession,
  type ResearchSessionDetail,
  type ResearchSessionPlan,
} from "@/components/api/research-sessions.api";
import {
  ConversationFeed,
  type ResearchMessage,
} from "./panel-view/conversation-feed";

interface ResearchSessionSidebarItem {
  id: string;
  displayName: string;
  namingStatus?: "naming" | "ready" | "failed";
}

function mapPlanStatus(
  status: ResearchSessionPlan["status"],
): ResearchMessage["planApprovalStatus"] {
  return status === "pending_approval" ? "awaiting_approval" : "approved";
}

function toResearchPlan(plan: ResearchSessionPlan): ResearchPlanStep[] {
  return plan.plan.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    dependsOn: [],
    status: "pending",
  }));
}

function mapSessionHistory(detail: ResearchSessionDetail): ResearchMessage[] {
  const plansById = new Map(detail.plans.map((plan) => [plan.id, plan]));
  const linkedPlanIds = new Set<string>();
  const history: ResearchMessage[] = [];
  for (const message of detail.messages) {
    if (message.role === "tool") continue;
    const plan = message.planVersionId
      ? plansById.get(message.planVersionId)
      : undefined;
    if (plan) linkedPlanIds.add(plan.id);

    history.push({
      id: message.id,
      role: message.role,
      content: message.content,
      researchPlan: plan ? toResearchPlan(plan) : undefined,
      planApprovalStatus: plan ? mapPlanStatus(plan.status) : undefined,
      planIterationCount: plan?.version,
      searchResults: [],
      retrievedChunks: [],
      createdAt: message.createdAt,
    });
  }

  for (const plan of detail.plans) {
    if (linkedPlanIds.has(plan.id)) continue;

    history.push({
      id: `plan-${plan.id}`,
      role: "assistant",
      content: "Research plan",
      researchPlan: toResearchPlan(plan),
      planApprovalStatus: mapPlanStatus(plan.status),
      planIterationCount: plan.version,
      createdAt: plan.createdAt,
    });
  }

  return history.sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function ResearchWorkspace() {
  const { user, isLogged, isLoading: isUserLoading } = useUser();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<"empty" | "conversation">(
    "empty",
  );
  const [queryText, setQueryText] = React.useState("");
  const [attachedDocs, setAttachedDocs] = React.useState<AttachedDocument[]>(
    [],
  );
  const [activeChatId, setActiveChatId] = React.useState<string | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [sidebarSessions, setSidebarSessions] = React.useState<
    ResearchSessionSidebarItem[]
  >([]);
  const [sessionsLoadedForUser, setSessionsLoadedForUser] = React.useState<
    string | null
  >(null);
  const historyRequestId = React.useRef(0);
  const activeChatIdRef = React.useRef<string | undefined>(undefined);
  const userId = user?.id;

  // Active conversation state
  const [messages, setMessages] = React.useState<ResearchMessage[]>([]);
  const [activeDocument, setActiveDocument] =
    React.useState<AttachedDocument | null>(null);
  const [lastUserQuery, setLastUserQuery] = React.useState<string>("");

  const refreshSessions = React.useCallback(async (signal?: AbortSignal) => {
    const result = await listResearchSessions({ limit: 50 }, signal);
    if (signal?.aborted) return [];
    setSidebarSessions(
      result.sessions.map((session) => ({
        id: session.id,
        displayName: session.displayName,
      })),
    );
    return result.sessions;
  }, []);

  React.useEffect(() => {
    if (!isLogged || !userId) return;

    const controller = new AbortController();
    listResearchSessions({ limit: 50 }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        const sessions = result.sessions;
        setSidebarSessions(
          sessions.map((session) => ({
            id: session.id,
            displayName: session.displayName,
          })),
        );
        const activeId = activeChatIdRef.current;
        if (activeId && !sessions.some((session) => session.id === activeId)) {
          activeChatIdRef.current = undefined;
          setActiveChatId(undefined);
          setMessages([]);
          setViewMode("empty");
        }
        setSessionsLoadedForUser(userId);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load research history.",
          );
          setSessionsLoadedForUser(userId);
        }
      });

    return () => controller.abort();
  }, [isLogged, refreshSessions, userId]);

  const isLoadingSessions =
    isLogged && Boolean(userId) && sessionsLoadedForUser !== userId;

  const handleAddDocs = (newDocs: AttachedDocument[]) => {
    setAttachedDocs((prev) => [...prev, ...newDocs]);
  };

  const handleRemoveDoc = (id: string) => {
    setAttachedDocs((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleGenerateSessionName = async (sessionId: string) => {
    setSidebarSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId
          ? { ...session, namingStatus: "naming" }
          : session,
      ),
    );
    const result = await generateResearchSessionName(sessionId);

    if (result.success) {
      try {
        await refreshSessions();
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to refresh research history.",
        );
      }
      setSidebarSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, namingStatus: "ready" }
            : session,
        ),
      );
    } else {
      setSidebarSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { ...session, namingStatus: "failed" }
            : session,
        ),
      );
      setErrorMessage(result.message);
    }
  };

  /**
   * Reset session back to centered empty state
   */
  const handleNewChat = () => {
    historyRequestId.current += 1;
    activeChatIdRef.current = undefined;
    setViewMode("empty");
    setMessages([]);
    setAttachedDocs([]);
    setQueryText("");
    setErrorMessage(null);
    setActiveDocument(null);
    setActiveChatId(undefined);
    setLastUserQuery("");
  };

  const handleSelectChat = async (sessionId: string) => {
    const requestId = ++historyRequestId.current;
    activeChatIdRef.current = sessionId;
    setActiveChatId(sessionId);
    setViewMode("conversation");
    setMessages([]);
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const detail = await getResearchSession(sessionId);
      if (requestId !== historyRequestId.current) return;

      const loadedMessages = mapSessionHistory(detail);
      setMessages(loadedMessages);
      setLastUserQuery(
        loadedMessages.find((message) => message.role === "user")?.content ??
          detail.session.title,
      );
      setActiveDocument(null);
      setAttachedDocs([]);
    } catch (error: unknown) {
      if (requestId === historyRequestId.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load this research session.",
        );
      }
    } finally {
      if (requestId === historyRequestId.current) setIsLoading(false);
    }
  };

  const handleRenameSession = async (
    sessionId: string,
    title: string,
  ): Promise<boolean> => {
    try {
      const updated = await renameResearchSession(sessionId, title);
      setSidebarSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? { id: updated.id, displayName: updated.displayName }
            : session,
        ),
      );
      return true;
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to rename this session.",
      );
      return false;
    }
  };

  const handleDeleteSession = async (sessionId: string): Promise<boolean> => {
    try {
      await deleteResearchSession(sessionId);
      setSidebarSessions((prev) =>
        prev.filter((session) => session.id !== sessionId),
      );
      if (activeChatId === sessionId) handleNewChat();
      return true;
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete this session.",
      );
      return false;
    }
  };

  /**
   * Dispatch query (either from centered empty state or from docked bottom panel bar)
   */
  const handleSubmit = async (query: string, docs: AttachedDocument[]) => {
    if (!query && docs.length === 0) return;
    const isFirstQuery = !activeChatId;

    // Transition from empty state to conversation panel
    if (viewMode === "empty") {
      setViewMode("conversation");
    }

    // Capture attached document if provided
    if (docs.length > 0 && docs[0]) {
      setActiveDocument(docs[0]);
    }

    setLastUserQuery(query);

    // Append User Message to conversation feed
    const userMsgId = Date.now().toString();
    const newUserMessage: ResearchMessage = {
      id: userMsgId,
      role: "user",
      content: query,
      attachedDocs: docs.length > 0 ? [...docs] : undefined,
      createdAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);
    setErrorMessage(null);

    // Prepare conversation history payload for backend
    const conversationHistory: ChatMessage[] = [
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: query },
    ];

    // File to send (either newly attached or existing active document's file)
    const attachedFile = docs[0]?.file || activeDocument?.file || null;

    try {
      const response = await executeResearchQuery({
        query: query || undefined,
        sessionId: activeChatId,
        document: attachedFile,
        conversationHistory,
        action: "generate_plan",
      });

      // if response genarated successfully, create a session id and set it as active chat id.
      if (response.success) {
        if (response.data.sessionId) {
          const sessionId = response.data.sessionId;
          activeChatIdRef.current = sessionId;
          setActiveChatId(sessionId);

          if (isFirstQuery) {
            const fallbackName =
              query.trim() || docs[0]?.file?.name || "Research session";
            setSidebarSessions((prev) => [
              {
                id: sessionId,
                displayName: fallbackName.slice(0, 80),
                namingStatus: "naming",
              },
              ...prev.filter((session) => session.id !== sessionId),
            ]);
            void handleGenerateSessionName(sessionId);
          }
        }

        const assistantMsgId = (Date.now() + 1).toString();
        const newAssistantMessage: ResearchMessage = {
          id: assistantMsgId,
          role: "assistant",
          content:
            response.data.answer ||
            "I have designed a research execution plan for your review. You can approve the plan to proceed with concurrent task execution and live web research, or edit the plan below.",
          planApprovalStatus:
            response.data.planApprovalStatus || "awaiting_approval",
          planIterationCount: response.data.planIterationCount || 1,
          researchPlan: response.data.researchPlan || [],
          searchResults: response.data.searchResults || [],
          retrievedChunks: response.data.retrievedChunks || [],
          createdAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };

        setMessages((prev) => [...prev, newAssistantMessage]);

        // Clear query text & documents from input composer
        setQueryText("");
        setAttachedDocs([]);
      } else {
        setErrorMessage(response.message);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Human-in-the-Loop: User approves research plan
   */
  const handleApprovePlan = async (
    messageId: string,
    plan: ResearchPlanStep[],
  ) => {
    setIsLoading(true);
    setErrorMessage(null);

    // Optimistically update message status to in progress
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              planApprovalStatus: "approved",
              researchPlan: plan.map((s) => ({
                ...s,
                status: "in_progress",
              })),
            }
          : msg,
      ),
    );

    const historyPayload: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const attachedFile = activeDocument?.file || null;

    try {
      const response = await executeResearchQuery({
        query: lastUserQuery || undefined,
        sessionId: activeChatId,
        document: attachedFile,
        conversationHistory: historyPayload,
        action: "approve_plan",
        researchPlan: plan,
      });

      if (response.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content:
                    response.data.answer ||
                    "Research query executed successfully.",
                  planApprovalStatus: "approved",
                  researchPlan: response.data.researchPlan || plan,
                  searchResults: response.data.searchResults || [],
                  retrievedChunks: response.data.retrievedChunks || [],
                }
              : msg,
          ),
        );
      } else {
        setErrorMessage(response.message);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to execute approved plan.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Human-in-the-Loop: User requests edits to the research plan
   */
  const handleEditPlan = async (
    messageId: string,
    plan: ResearchPlanStep[],
    feedback: string,
  ) => {
    setIsLoading(true);
    setErrorMessage(null);

    const historyPayload: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const attachedFile = activeDocument?.file || null;

    try {
      const response = await executeResearchQuery({
        query: lastUserQuery || undefined,
        sessionId: activeChatId,
        document: attachedFile,
        conversationHistory: historyPayload,
        action: "edit_plan",
        userPlanEdits: feedback,
        researchPlan: plan,
      });

      if (response.success) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content:
                    "I have revised the research plan incorporating your requested edits. Please review and approve.",
                  planApprovalStatus:
                    response.data.planApprovalStatus || "awaiting_approval",
                  planIterationCount:
                    response.data.planIterationCount ||
                    (msg.planIterationCount || 1) + 1,
                  researchPlan: response.data.researchPlan || plan,
                }
              : msg,
          ),
        );
      } else {
        setErrorMessage(response.message);
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update research plan.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
      {/* 1. Left Sidebar (ChatGPT-style) */}
      <ResearchSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activeChatId={activeChatId}
        sessions={isLogged ? sidebarSessions : []}
        sessionsLoading={isLoadingSessions}
        onSelectChat={(id) => void handleSelectChat(id)}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        onNewChat={handleNewChat}
      />

      {/* 2. Main Content Viewport */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden relative">
        {/* Top Navbar */}
        <header className="absolute right-0 top-0 z-10 flex h-14 items-center gap-2 px-4">
          {!isUserLoading && !isLogged && (
            <>
              <Button
                render={<Link href="/login" />}
                variant="ghost"
                size="sm"
              >
                Log in
              </Button>
              <Button render={<Link href="/register" />} size="sm">
                Sign up
              </Button>
            </>
          )}
        </header>

        {/* Dynamic View: Empty State vs Conversation View */}
        {viewMode === "empty" || !isLogged || isLoadingSessions ? (
          /* Empty State: Instruction with Query Composer in the middle like Microsoft Copilot */
          <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-3xl flex flex-col items-center">
              {/* Instruction header */}
              <ResearchEmptyState />

              {/* Error Banner if request failed */}
              {errorMessage && (
                <div className="w-full mb-3 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="p-1 rounded-md hover:bg-destructive/15 text-destructive/80 hover:text-destructive transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Query composer directly below the instruction */}
              <ResearchQueryBar
                value={queryText}
                onChange={setQueryText}
                onSubmit={handleSubmit}
                attachedDocs={attachedDocs}
                onAddDocs={handleAddDocs}
                onRemoveDoc={handleRemoveDoc}
                isLoading={isLoading}
              />
            </div>
          </main>
        ) : (
          /* Conversation View with Docked Bottom Query Bar */
          <div className="relative flex-1 min-h-0 overflow-hidden">
            {errorMessage && (
              <div className="absolute left-4 right-4 top-2 z-10 flex items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2 text-xs text-destructive animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1 rounded-md hover:bg-destructive/15 text-destructive/80 hover:text-destructive transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <div
              className={`absolute inset-0 overflow-y-auto ${
                errorMessage ? "pt-16" : ""
              }`}
            >
              <ConversationFeed
                messages={messages}
                isLoading={isLoading}
                onApprovePlan={handleApprovePlan}
                onEditPlan={handleEditPlan}
              />
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-4 z-20 bg-background px-3 pb-3 pt-0">
              <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                <ResearchQueryBar
                  value={queryText}
                  onChange={setQueryText}
                  onSubmit={handleSubmit}
                  attachedDocs={attachedDocs}
                  onAddDocs={handleAddDocs}
                  onRemoveDoc={handleRemoveDoc}
                  isLoading={isLoading}
                  placeholder="Ask a follow-up research question in this conversation..."
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
