import { researchMessageRepository } from "../../database/mongo/research-message/researchMessageModelRepo";
import { researchPlanVersionRepository } from "../../database/mongo/research-plan/researchPlanVersionModelRepo";
import { researchSessionRepository } from "../../database/mongo/research-session/researchSessionModelRepo";
import { AppError } from "../../Error/appError";

class ResearchSessionService {
  public async listSessions(
    userId: string,
    options: { page: number; limit: number; search?: string },
  ) {
    const result = await researchSessionRepository.findByUserId(
      userId,
      options.search ? { search: options.search } : undefined,
      { page: options.page, limit: options.limit, sortOrder: "desc" },
    );

    return {
      sessions: result.sessions.map((session) => ({
        id: session.getId().toString(),
        title: session.getTitle(),
        displayName: session.getDisplayName(),
        status: session.getStatus(),
        messageCount: session.getMessageCount(),
        createdAt: session.getCreatedAt(),
        updatedAt: session.getUpdatedAt(),
      })),
      total: result.total,
      page: options.page,
      limit: options.limit,
    };
  }

  public async getSession(userId: string, sessionId: string) {
    const session = await this.getOwnedSession(userId, sessionId);
    const [messages, plans] = await Promise.all([
      researchMessageRepository.findBySessionId(sessionId),
      researchPlanVersionRepository.findAllBySessionId(sessionId),
    ]);

    return {
      session: {
        id: session.getId().toString(),
        title: session.getTitle(),
        displayName: session.getDisplayName(),
        status: session.getStatus(),
        messageCount: session.getMessageCount(),
        createdAt: session.getCreatedAt(),
        updatedAt: session.getUpdatedAt(),
      },
      messages: messages.map((message) => ({
        id: message.getId().toString(),
        sequence: message.getSequence(),
        role: message.getRole(),
        content: message.getContent(),
        planVersionId: message.planVersionId ?? null,
        sources: message.getSources(),
        createdAt: message.getCreatedAt(),
      })),
      plans: plans.map((plan) => ({
        id: plan.getId().toString(),
        version: plan.getVersion(),
        status: plan.getStatus(),
        createdAt: plan.getCreatedAt(),
        approvedAt: plan.getApprovedAt() ?? null,
        plan: {
          title: plan.getPlan().title,
          objective: plan.getPlan().objective,
          steps: plan.getSteps().map((step) => ({
            id: step.stepId,
            title: step.title,
            description: step.description,
          })),
        },
      })),
    };
  }

  public async renameSession(
    userId: string,
    sessionId: string,
    title: string,
  ) {
    const session = await this.getOwnedSession(userId, sessionId);
    session.updateTitle(title);
    const updatedSession = await researchSessionRepository.updateSession(session);

    return {
      id: updatedSession.getId().toString(),
      title: updatedSession.getTitle(),
      displayName: updatedSession.getDisplayName(),
      status: updatedSession.getStatus(),
      messageCount: updatedSession.getMessageCount(),
      createdAt: updatedSession.getCreatedAt(),
      updatedAt: updatedSession.getUpdatedAt(),
    };
  }

  public async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.getOwnedSession(userId, sessionId);

    await researchMessageRepository.deleteBySessionId(sessionId);
    await researchPlanVersionRepository.deleteBySessionId(sessionId);

    const deleted = await researchSessionRepository.deleteSession(sessionId);
    if (!deleted) {
      throw new AppError("Research session not found", 404);
    }
  }

  private async getOwnedSession(userId: string, sessionId: string) {
    const session = await researchSessionRepository.findById(sessionId);
    if (!session || session.getUserId().toString() !== userId) {
      throw new AppError("Research session not found", 404);
    }
    return session;
  }
}

export const researchSessionService = new ResearchSessionService();
