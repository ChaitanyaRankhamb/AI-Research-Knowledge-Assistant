import { UserId } from "../user/userId";
import { ResearchSessionId } from "./researchSessionId";

export type ResearchStatus =
  | "planning"
  | "awaiting_plan_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Domain entity representing a user's research chat session.
 * Encapsulates session state transitions, plan versions, and message counts.
 */
export class ResearchSession {
  constructor(
    public readonly id: ResearchSessionId,
    public readonly userId: UserId,
    private title: string,
    public readonly initialQuery: string,
    private status: ResearchStatus = "planning",
    private currentPlanVersion: number = 0,
    private pendingPlanVersionId: string | null = null,
    private activePlanVersionId: string | null = null,
    private messageCount: number = 0,
    private completedAt?: Date | null,
    public readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date(),
    private generatedName: string | null = null,
    private customTitle: string | null = null,
  ) {}

  // ==========================================
  // Getters
  // ==========================================

  public getId(): ResearchSessionId {
    return this.id;
  }

  public getUserId(): UserId {
    return this.userId;
  }

  public getTitle(): string {
    return this.title;
  }

  public getGeneratedName(): string | null {
    return this.generatedName;
  }

  public getCustomTitle(): string | null {
    return this.customTitle;
  }

  public getDisplayName(): string {
    return this.customTitle?.trim() || this.generatedName?.trim() || this.title;
  }

  public getInitialQuery(): string {
    return this.initialQuery;
  }

  public getStatus(): ResearchStatus {
    return this.status;
  }

  public getCurrentPlanVersion(): number {
    return this.currentPlanVersion;
  }

  public getPendingPlanVersionId(): string | null {
    return this.pendingPlanVersionId;
  }

  public getActivePlanVersionId(): string | null {
    return this.activePlanVersionId;
  }

  public getMessageCount(): number {
    return this.messageCount;
  }

  public getCompletedAt(): Date | null | undefined {
    return this.completedAt;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  // ==========================================
  // State Transition & Domain Methods
  // ==========================================

  /**
   * Updates session title (e.g. user renames the chat in the sidebar).
   */
  public updateTitle(newTitle: string): void {
    if (!newTitle.trim()) {
      throw new Error("Session title cannot be empty");
    }
    this.customTitle = newTitle.trim();
    this.touch();
  }

  public updateGeneratedName(newName: string): void {
    if (!newName.trim()) {
      throw new Error("Generated session name cannot be empty");
    }
    this.generatedName = newName.trim();
    this.touch();
  }

  /**
   * Updates general session status.
   */
  public updateStatus(status: ResearchStatus): void {
    this.status = status;
    this.touch();
  }

  /**
   * Records a new pending plan version waiting for user approval.
   */
  public setPendingPlan(planVersionId: string, versionNumber: number): void {
    this.pendingPlanVersionId = planVersionId;
    this.currentPlanVersion = versionNumber;
    this.status = "awaiting_plan_approval";
    this.touch();
  }

  /**
   * Approves the pending plan and transitions status to executing.
   */
  public approvePlan(planVersionId: string): void {
    this.activePlanVersionId = planVersionId;
    this.pendingPlanVersionId = null;
    this.status = "executing";
    this.touch();
  }

  /**
   * Marks research session as successfully completed.
   */
  public completeSession(): void {
    this.status = "completed";
    this.completedAt = new Date();
    this.touch();
  }

  /**
   * Marks research session as failed.
   */
  public failSession(): void {
    this.status = "failed";
    this.touch();
  }

  /**
   * Cancels the research session.
   */
  public cancelSession(): void {
    this.status = "cancelled";
    this.touch();
  }

  /**
   * Increments the total message counter for this chat.
   */
  public incrementMessageCount(): void {
    this.messageCount += 1;
    this.touch();
  }

  /**
   * Updates timestamp on modification.
   */
  private touch(): void {
    this.updatedAt = new Date();
  }

  /**
   * Serializes the domain entity to a plain JSON object.
   */
  public toJSON() {
    return {
      id: this.id.toString(),
      userId: this.userId.toString(),
      title: this.title,
      customTitle: this.customTitle,
      generatedName: this.generatedName,
      displayName: this.getDisplayName(),
      initialQuery: this.initialQuery,
      status: this.status,
      currentPlanVersion: this.currentPlanVersion,
      pendingPlanVersionId: this.pendingPlanVersionId,
      activePlanVersionId: this.activePlanVersionId,
      messageCount: this.messageCount,
      completedAt: this.completedAt ?? null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
