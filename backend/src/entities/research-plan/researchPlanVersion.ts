import { UserId } from "../user/userId";
import { ResearchSessionId } from "../research-session/researchSessionId";
import { ResearchPlanVersionId } from "./researchPlanVersionId";

export interface IResearchPlanStep {
  stepId: string;
  title: string;
  description: string;
}

export type PlanCreatedBy = "ai" | "user";

export type PlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "superseded"
  | "rejected";

export interface IResearchPlanContent {
  title: string;
  objective: string;
  steps: IResearchPlanStep[];
}

/**
 * Domain entity representing an immutable or versioned Research Plan.
 * Captures historical revisions, user modifications, and approval status.
 */
export class ResearchPlanVersion {
  constructor(
    public readonly id: ResearchPlanVersionId,
    public readonly sessionId: ResearchSessionId,
    public readonly version: number,
    public readonly basedOnVersion: number | null = null,
    public readonly createdBy: PlanCreatedBy = "ai",
    private status: PlanStatus = "draft",
    private plan: IResearchPlanContent = { title: "", objective: "", steps: [] },
    private changeSummary?: string | null,
    private approvedBy?: UserId | null,
    private approvedAt?: Date | null,
    public readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date(),
  ) {}

  // ==========================================
  // Getters
  // ==========================================

  public getId(): ResearchPlanVersionId {
    return this.id;
  }

  public getSessionId(): ResearchSessionId {
    return this.sessionId;
  }

  public getVersion(): number {
    return this.version;
  }

  public getBasedOnVersion(): number | null {
    return this.basedOnVersion;
  }

  public getCreatedBy(): PlanCreatedBy {
    return this.createdBy;
  }

  public getStatus(): PlanStatus {
    return this.status;
  }

  public getPlan(): IResearchPlanContent {
    return this.plan;
  }

  public getSteps(): IResearchPlanStep[] {
    return this.plan.steps;
  }

  public getChangeSummary(): string | null | undefined {
    return this.changeSummary;
  }

  public getApprovedBy(): UserId | null | undefined {
    return this.approvedBy;
  }

  public getApprovedAt(): Date | null | undefined {
    return this.approvedAt;
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

  /**
   * Approves this plan version.
   */
  public approve(approvedByUserId: UserId): void {
    this.status = "approved";
    this.approvedBy = approvedByUserId;
    this.approvedAt = new Date();
    this.touch();
  }

  /**
   * Marks this plan version as superseded by a newer version.
   */
  public supersede(): void {
    this.status = "superseded";
    this.touch();
  }

  /**
   * Rejects this plan version.
   */
  public reject(): void {
    this.status = "rejected";
    this.touch();
  }

  /**
   * Updates plan steps if the plan is still draft or pending approval.
   */
  public updateSteps(steps: IResearchPlanStep[], summary?: string): void {
    if (this.status === "approved" || this.status === "superseded") {
      throw new Error(`Cannot modify plan steps when plan is ${this.status}`);
    }
    this.plan.steps = steps;
    if (summary) {
      this.changeSummary = summary;
    }
    this.touch();
  }

  private touch(): void {
    this.updatedAt = new Date();
  }

  /**
   * Serializes the plan version entity into plain JSON.
   */
  public toJSON() {
    return {
      id: this.id.toString(),
      sessionId: this.sessionId.toString(),
      version: this.version,
      basedOnVersion: this.basedOnVersion,
      createdBy: this.createdBy,
      status: this.status,
      plan: {
        title: this.plan.title,
        objective: this.plan.objective,
        steps: this.plan.steps,
      },
      changeSummary: this.changeSummary ?? null,
      approvedBy: this.approvedBy ? this.approvedBy.toString() : null,
      approvedAt: this.approvedAt ?? null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
