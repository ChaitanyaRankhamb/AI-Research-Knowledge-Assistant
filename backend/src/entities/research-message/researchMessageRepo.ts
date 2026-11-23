import {
  IMessageMetadata,
  IMessageSource,
  MessageRole,
  ResearchMessage,
} from "./researchMessage";
import { PaginationOptions } from "../research-session/researchSessionRepo";

export interface CreateResearchMessageData {
  sessionId: string;
  userId: string;
  sequence: number;
  role: MessageRole;
  content: string;
  sources?: IMessageSource[];
  executionId?: string | null;
  planVersionId?: string | null;
  metadata?: IMessageMetadata | null;
}

/**
 * Interface defining operations for the Research Message Repository.
 */
export interface IResearchMessageRepository {
  createMessage(
    data: CreateResearchMessageData,
    session?: unknown,
  ): Promise<ResearchMessage>;
  findById(id: string, session?: unknown): Promise<ResearchMessage | null>;
  findBySessionId(
    sessionId: string,
    options?: PaginationOptions,
    session?: unknown,
  ): Promise<ResearchMessage[]>;
  getNextSequence(sessionId: string, session?: unknown): Promise<number>;
  countBySessionId(sessionId: string, session?: unknown): Promise<number>;
  deleteBySessionId(sessionId: string, session?: unknown): Promise<number>;
}
