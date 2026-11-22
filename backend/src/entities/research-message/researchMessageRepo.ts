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
  createMessage(data: CreateResearchMessageData): Promise<ResearchMessage>;
  findById(id: string): Promise<ResearchMessage | null>;
  findBySessionId(
    sessionId: string,
    options?: PaginationOptions,
  ): Promise<ResearchMessage[]>;
  getNextSequence(sessionId: string): Promise<number>;
  countBySessionId(sessionId: string): Promise<number>;
  deleteBySessionId(sessionId: string): Promise<number>;
}
