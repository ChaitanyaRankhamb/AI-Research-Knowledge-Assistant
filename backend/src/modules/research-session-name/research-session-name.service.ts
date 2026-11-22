import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AppError } from "../../Error/appError";
import { llmService } from "../research-query/llm/llm.service";
import { RESEARCH_SESSION_NAME_SYSTEM_PROMPT } from "./system-prompt";
import { userRepository } from "../../database/mongo/user/userModelRepo";
import { researchSessionRepository } from "../../database/mongo/research-session/researchSessionModelRepo";

class ResearchSessionNameService {
  public async generateName(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    const user = await userRepository.findUserById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const session = await researchSessionRepository.findById(sessionId);
    if (!session || session.getUserId().toString() !== userId) {
      throw new AppError("Research session not found", 404);
    }

    const response = await llmService.generateResponse(
      [
        new SystemMessage(RESEARCH_SESSION_NAME_SYSTEM_PROMPT),
        new HumanMessage(session.getInitialQuery()),
      ],
      { temperature: 0.2, maxOutputTokens: 64 },
    );
    const generatedName = response
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim();

    if (!generatedName) {
      throw new AppError("The generated research session name was empty.", 502);
    }

    session.updateGeneratedName(generatedName);
    await researchSessionRepository.updateSession(session);
    return generatedName;
  }
}

export const researchSessionNameService = new ResearchSessionNameService();
