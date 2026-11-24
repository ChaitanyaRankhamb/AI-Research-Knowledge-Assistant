import { ClientSession, Types } from "mongoose";
import {
  createInitialResearchExecutionEvents,
  type ResearchExecutionError,
  type ResearchExecutionEventName,
  type ResearchExecutionStepData,
  type ResearchExecutionStatus,
  type ResearchExecutionStep,
} from "../../../entities/research-execution/researchExecution";
import {
  IResearchExecution,
  ResearchExecutionModel,
} from "./researchExecutionModel";

const EVENT_LEASE_MS = 2 * 60 * 1000;
const STEP_LEASE_MS = 2 * 60 * 1000;

export interface CreateResearchExecutionData {
  executionId: string;
  requestId: string;
  sessionId: string;
}

export class MongoResearchExecutionRepository {
  async findByExecutionId(executionId: string): Promise<IResearchExecution | null> {
    return ResearchExecutionModel.findOne({ executionId }).exec();
  }

  async findByRequestId(requestId: string): Promise<IResearchExecution | null> {
    return ResearchExecutionModel.findOne({ requestId }).exec();
  }

  async findBySessionAndPlanVersion(
    sessionId: string,
    planVersionId: string,
  ): Promise<IResearchExecution | null> {
    if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(planVersionId)) {
      return null;
    }

    return ResearchExecutionModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
      planVersionId: new Types.ObjectId(planVersionId),
    }).exec();
  }

  async createOrFind(
    data: CreateResearchExecutionData,
  ): Promise<IResearchExecution> {
    if (!Types.ObjectId.isValid(data.sessionId)) {
      throw new Error("Cannot create research execution for an invalid session ID.");
    }

    let execution: IResearchExecution | null;
    try {
      execution = await ResearchExecutionModel.findOneAndUpdate(
        { requestId: data.requestId },
        {
          $setOnInsert: {
            executionId: data.executionId,
            requestId: data.requestId,
            sessionId: new Types.ObjectId(data.sessionId),
            planVersionId: null,
            status: "pending",
            error: null,
            events: createInitialResearchExecutionEvents(),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).exec();
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        execution = await this.findByRequestId(data.requestId);
        if (!execution) throw error;
      } else {
        throw error;
      }
    }

    if (!execution) {
      throw new Error("Research execution could not be created or loaded.");
    }
    if (execution.sessionId.toString() !== data.sessionId) {
      throw new Error("Request ID is already associated with another session.");
    }

    return execution;
  }

  async setPlanVersion(
    executionId: string,
    planVersionId: string,
    session?: ClientSession,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(planVersionId)) {
      throw new Error("Cannot associate research execution with an invalid plan version ID.");
    }

    const result = await ResearchExecutionModel.updateOne(
      { executionId },
      { $set: { planVersionId: new Types.ObjectId(planVersionId) } },
    ).session(session ?? null).exec();
    this.requireMatched(result.matchedCount, executionId);
  }

  async deleteBySessionId(
    sessionId: string,
    session?: ClientSession,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 0;
    const result = await ResearchExecutionModel.deleteMany(
      { sessionId: new Types.ObjectId(sessionId) },
      { session },
    ).exec();
    return result.deletedCount;
  }

  async setExecutionStatus(
    executionId: string,
    status: ResearchExecutionStatus,
    error: ResearchExecutionError | null = null,
    session?: ClientSession,
  ): Promise<void> {
    const result = await ResearchExecutionModel.updateOne(
      { executionId },
      { $set: { status, error } },
    ).session(session ?? null).exec();
    this.requireMatched(result.matchedCount, executionId);
  }

  async skipPendingEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
  ): Promise<void> {
    await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: { $elemMatch: { eventId, status: "pending" } },
      },
      {
        $set: {
          "events.$[event].status": "skipped",
          "events.$[event].completedAt": new Date(),
        },
      },
      { arrayFilters: [{ "event.eventId": eventId, "event.status": "pending" }] },
    ).exec();
  }

  async skipPendingEvents(executionId: string): Promise<void> {
    await ResearchExecutionModel.updateOne(
      { executionId },
      {
        $set: {
          "events.$[event].status": "skipped",
          "events.$[event].completedAt": new Date(),
        },
      },
      { arrayFilters: [{ "event.status": "pending" }] },
    ).exec();
  }

  async getEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
  ) {
    const execution = await this.findByExecutionId(executionId);
    return execution?.events.find((event) => event.eventId === eventId) ?? null;
  }

  async claimEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
    workerId: string,
  ): Promise<"claimed" | "completed" | "busy"> {
    const current = await this.getEvent(executionId, eventId);
    if (!current) {
      throw new Error(`Research execution event "${eventId}" was not found.`);
    }
    if (current.status === "completed") return "completed";

    const now = new Date();
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: {
          $elemMatch: {
            eventId,
            $or: [
              { status: { $in: ["pending", "failed", "skipped"] } },
              {
                status: "processing",
                leaseExpiresAt: { $lte: now },
              },
            ],
          },
        },
      },
      {
        $set: {
          "events.$[event].status": "processing",
          "events.$[event].leaseOwner": workerId,
          "events.$[event].leaseExpiresAt": new Date(
            now.getTime() + EVENT_LEASE_MS,
          ),
          "events.$[event].heartbeatAt": now,
          "events.$[event].completedAt": null,
          "events.$[event].error": null,
        },
        $inc: { "events.$[event].attemptCount": 1 },
        $currentDate: { "events.$[event].startedAt": true },
      },
      { arrayFilters: [{ "event.eventId": eventId }] },
    ).exec();

    if (result.modifiedCount === 1) return "claimed";

    const latest = await this.getEvent(executionId, eventId);
    return latest?.status === "completed" ? "completed" : "busy";
  }

  async heartbeatEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
    workerId: string,
  ): Promise<boolean> {
    const now = new Date();
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: { $elemMatch: { eventId, status: "processing", leaseOwner: workerId } },
      },
      {
        $set: {
          "events.$[event].heartbeatAt": now,
          "events.$[event].leaseExpiresAt": new Date(
            now.getTime() + EVENT_LEASE_MS,
          ),
        },
      },
      { arrayFilters: [{ "event.eventId": eventId, "event.leaseOwner": workerId }] },
    ).exec();
    return result.modifiedCount === 1;
  }

  async completeEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
    workerId: string,
    resultValue: Record<string, unknown>,
  ): Promise<void> {
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: { $elemMatch: { eventId, status: "processing", leaseOwner: workerId } },
      },
      {
        $set: {
          "events.$[event].status": "completed",
          "events.$[event].result": resultValue,
          "events.$[event].completedAt": new Date(),
          "events.$[event].error": null,
          "events.$[event].leaseOwner": null,
          "events.$[event].leaseExpiresAt": null,
        },
      },
      { arrayFilters: [{ "event.eventId": eventId, "event.leaseOwner": workerId }] },
    ).exec();
    this.requireMatched(result.modifiedCount, executionId, eventId);
  }

  async failEvent(
    executionId: string,
    eventId: ResearchExecutionEventName,
    workerId: string,
    error: ResearchExecutionError,
  ): Promise<void> {
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: { $elemMatch: { eventId, status: "processing", leaseOwner: workerId } },
      },
      {
        $set: {
          "events.$[event].status": "failed",
          "events.$[event].error": error,
          "events.$[event].completedAt": new Date(),
          "events.$[event].leaseOwner": null,
          "events.$[event].leaseExpiresAt": null,
        },
      },
      { arrayFilters: [{ "event.eventId": eventId, "event.leaseOwner": workerId }] },
    ).exec();
    this.requireMatched(result.modifiedCount, executionId, eventId);
  }

  async ensureSteps(
    executionId: string,
    steps: ResearchExecutionStepData[],
  ): Promise<void> {
    const event = await this.getEvent(
      executionId,
      "executeConcurrentResearchStepsNode",
    );
    if (!event) {
      throw new Error("Concurrent research execution event was not found.");
    }

    const existingIds = new Set((event.steps ?? []).map((step) => step.stepId));
    const missingSteps = steps
      .filter((step) => !existingIds.has(step.id))
      .map((step) => ({
        stepId: step.id,
        title: step.title,
        description: step.description ?? "",
        dependsOn: step.dependsOn ?? [],
        status: "pending" as const,
        attemptCount: 0,
        startedAt: null,
        completedAt: null,
        result: undefined,
        outputSnippet: undefined,
        searchResults: [],
        error: null,
        idempotencyKey: `${executionId}:${step.id}`,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      }));

    if (missingSteps.length > 0) {
      await ResearchExecutionModel.updateOne(
        { executionId, "events.eventId": "executeConcurrentResearchStepsNode" },
        {
          $push: {
            "events.$.steps": { $each: missingSteps },
          },
        },
      ).exec();
    }
  }

  async getSteps(executionId: string): Promise<ResearchExecutionStep[]> {
    const event = await this.getEvent(
      executionId,
      "executeConcurrentResearchStepsNode",
    );
    return event?.steps ?? [];
  }

  async claimStep(
    executionId: string,
    stepId: string,
    workerId: string,
  ): Promise<boolean> {
    const now = new Date();
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: {
          $elemMatch: {
            eventId: "executeConcurrentResearchStepsNode",
            steps: {
              $elemMatch: {
                stepId,
                $or: [
                  { status: { $in: ["pending", "failed"] } },
                  { status: "processing", leaseExpiresAt: { $lte: now } },
                ],
              },
            },
          },
        },
      },
      {
        $set: {
          "events.$[event].steps.$[step].status": "processing",
          "events.$[event].steps.$[step].leaseOwner": workerId,
          "events.$[event].steps.$[step].leaseExpiresAt": new Date(
            now.getTime() + STEP_LEASE_MS,
          ),
          "events.$[event].steps.$[step].heartbeatAt": now,
          "events.$[event].steps.$[step].completedAt": null,
          "events.$[event].steps.$[step].error": null,
        },
        $inc: { "events.$[event].steps.$[step].attemptCount": 1 },
        $currentDate: {
          "events.$[event].steps.$[step].startedAt": true,
        },
      },
      {
        arrayFilters: [
          { "event.eventId": "executeConcurrentResearchStepsNode" },
          {
            $and: [
              { "step.stepId": stepId },
              {
                $or: [
                  { "step.status": { $in: ["pending", "failed"] } },
                  {
                    $and: [
                      { "step.status": "processing" },
                      { "step.leaseExpiresAt": { $lte: now } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ).exec();
    return result.modifiedCount === 1;
  }

  async heartbeatStep(
    executionId: string,
    stepId: string,
    workerId: string,
  ): Promise<boolean> {
    const now = new Date();
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: {
          $elemMatch: {
            eventId: "executeConcurrentResearchStepsNode",
            steps: { $elemMatch: { stepId, status: "processing", leaseOwner: workerId } },
          },
        },
      },
      {
        $set: {
          "events.$[event].steps.$[step].heartbeatAt": now,
          "events.$[event].steps.$[step].leaseExpiresAt": new Date(
            now.getTime() + STEP_LEASE_MS,
          ),
        },
      },
      {
        arrayFilters: [
          { "event.eventId": "executeConcurrentResearchStepsNode" },
          { "step.stepId": stepId, "step.leaseOwner": workerId },
        ],
      },
    ).exec();
    return result.modifiedCount === 1;
  }

  async completeStep(
    executionId: string,
    stepId: string,
    workerId: string,
    resultData: {
      result: string;
      outputSnippet: string;
      searchResults: ResearchExecutionStep["searchResults"];
    },
  ): Promise<void> {
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: {
          $elemMatch: {
            eventId: "executeConcurrentResearchStepsNode",
            steps: { $elemMatch: { stepId, status: "processing", leaseOwner: workerId } },
          },
        },
      },
      {
        $set: {
          "events.$[event].steps.$[step].status": "completed",
          "events.$[event].steps.$[step].result": resultData.result,
          "events.$[event].steps.$[step].outputSnippet": resultData.outputSnippet,
          "events.$[event].steps.$[step].searchResults": resultData.searchResults,
          "events.$[event].steps.$[step].completedAt": new Date(),
          "events.$[event].steps.$[step].error": null,
          "events.$[event].steps.$[step].leaseOwner": null,
          "events.$[event].steps.$[step].leaseExpiresAt": null,
        },
      },
      {
        arrayFilters: [
          { "event.eventId": "executeConcurrentResearchStepsNode" },
          { "step.stepId": stepId, "step.leaseOwner": workerId },
        ],
      },
    ).exec();
    this.requireMatched(result.modifiedCount, executionId, stepId);
  }

  async failStep(
    executionId: string,
    stepId: string,
    workerId: string,
    error: ResearchExecutionError,
  ): Promise<void> {
    const result = await ResearchExecutionModel.updateOne(
      {
        executionId,
        events: {
          $elemMatch: {
            eventId: "executeConcurrentResearchStepsNode",
            steps: { $elemMatch: { stepId, status: "processing", leaseOwner: workerId } },
          },
        },
      },
      {
        $set: {
          "events.$[event].steps.$[step].status": "failed",
          "events.$[event].steps.$[step].error": error,
          "events.$[event].steps.$[step].completedAt": new Date(),
          "events.$[event].steps.$[step].leaseOwner": null,
          "events.$[event].steps.$[step].leaseExpiresAt": null,
        },
      },
      {
        arrayFilters: [
          { "event.eventId": "executeConcurrentResearchStepsNode" },
          { "step.stepId": stepId, "step.leaseOwner": workerId },
        ],
      },
    ).exec();
    this.requireMatched(result.modifiedCount, executionId, stepId);
  }

  private requireMatched(
    modifiedCount: number,
    executionId: string,
    itemId?: string,
  ): void {
    if (modifiedCount !== 1) {
      throw new Error(
        `Research execution update lost its conditional match (${executionId}${itemId ? `, ${itemId}` : ""}).`,
      );
    }
  }
}

export const researchExecutionRepository =
  new MongoResearchExecutionRepository();
