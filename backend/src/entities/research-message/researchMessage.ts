import { UserId } from "../user/userId";
import { ResearchSessionId } from "../research-session/researchSessionId";
import { ResearchMessageId } from "./researchMessageId";

export type MessageRole = "user" | "assistant" | "tool";

export interface IMessageSource {
  sourceId: string;
  title: string;
  url?: string;
  snippet?: string;
  documentId?: string;
  chunkId?: string;
  retrievalScore?: number;
}

export interface IMessageMetadata {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Domain entity representing an individual message in a research session.
 * Tracks message sequence, sender role, content, citation sources, and token metadata.
 */
export class ResearchMessage {
  constructor(
    public readonly id: ResearchMessageId,
    public readonly sessionId: ResearchSessionId,
    public readonly userId: UserId,
    public readonly sequence: number,
    public readonly role: MessageRole,
    private content: string,
    private sources: IMessageSource[] = [],
    public readonly executionId?: string | null,
    private metadata?: IMessageMetadata | null,
    public readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date(),
    public readonly planVersionId?: string | null,
  ) {}

  // ==========================================
  // Getters
  // ==========================================

  public getId(): ResearchMessageId {
    return this.id;
  }

  public getSessionId(): ResearchSessionId {
    return this.sessionId;
  }

  public getUserId(): UserId {
    return this.userId;
  }

  public getSequence(): number {
    return this.sequence;
  }

  public getRole(): MessageRole {
    return this.role;
  }

  public getContent(): string {
    return this.content;
  }

  public getSources(): IMessageSource[] {
    return this.sources;
  }

  public getExecutionId(): string | null | undefined {
    return this.executionId;
  }

  public getMetadata(): IMessageMetadata | null | undefined {
    return this.metadata;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // ==========================================
  // Domain Operations
  // ==========================================

  public addSource(source: IMessageSource): void {
    this.sources.push(source);
    this.touch();
  }

  public setSources(sources: IMessageSource[]): void {
    this.sources = sources;
    this.touch();
  }

  public updateContent(content: string): void {
    this.content = content;
    this.touch();
  }

  public appendContent(chunk: string): void {
    this.content += chunk;
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  /**
   * Serializes the message entity into plain JSON.
   */
  public toJSON() {
    return {
      id: this.id.toString(),
      sessionId: this.sessionId.toString(),
      userId: this.userId.toString(),
      sequence: this.sequence,
      role: this.role,
      content: this.content,
      planVersionId: this.planVersionId ?? null,
      sources: this.sources,
      executionId: this.executionId ?? null,
      metadata: this.metadata ?? null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
