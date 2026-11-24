import mongoose, { Document, Schema, Types } from "mongoose";
import {
  RESEARCH_EXECUTION_EVENT_NAMES,
  type ResearchExecutionError,
  type ResearchExecutionEvent,
  type ResearchExecutionStatus,
  type ResearchExecutionSearchResult,
  type ResearchExecutionStep,
} from "../../../entities/research-execution/researchExecution";

export interface IResearchExecution extends Document {
  executionId: string;
  requestId: string;
  sessionId: Types.ObjectId;
  planVersionId: Types.ObjectId | null;
  status: ResearchExecutionStatus;
  error?: ResearchExecutionError | null;
  events: ResearchExecutionEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const errorSchema = new Schema<ResearchExecutionError>(
  {
    message: { type: String, required: true },
    name: String,
    service: String,
    statusCode: Number,
    occurredAt: { type: Date, required: true },
  },
  { _id: false },
);

const searchResultSchema = new Schema<ResearchExecutionSearchResult>(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    content: { type: String, required: true },
    score: Number,
  },
  { _id: false },
);

const executionStepSchema = new Schema<ResearchExecutionStep>(
  {
    stepId: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    dependsOn: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
      required: true,
    },
    attemptCount: { type: Number, min: 0, default: 0, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    result: String,
    outputSnippet: String,
    searchResults: { type: [searchResultSchema], default: [] },
    error: { type: errorSchema, default: null },
    idempotencyKey: { type: String, required: true },
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
  },
  { _id: false },
);

const executionEventSchema = new Schema<ResearchExecutionEvent>(
  {
    eventId: {
      type: String,
      enum: RESEARCH_EXECUTION_EVENT_NAMES,
      required: true,
    },
    name: {
      type: String,
      enum: RESEARCH_EXECUTION_EVENT_NAMES,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
      required: true,
    },
    attemptCount: { type: Number, min: 0, default: 0, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: errorSchema, default: null },
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    heartbeatAt: { type: Date, default: null },
    steps: { type: [executionStepSchema], default: [] },
  },
  { _id: false },
);

const researchExecutionSchema = new Schema<IResearchExecution>(
  {
    executionId: { type: String, required: true },
    requestId: { type: String, required: true },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
    },
    planVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchPlanVersion",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "skipped"],
      default: "pending",
      required: true,
    },
    error: { type: errorSchema, default: null },
    events: { type: [executionEventSchema], default: [] },
  },
  {
    collection: "ResearchExecutions",
    timestamps: true,
    versionKey: "__v",
  },
);

researchExecutionSchema.index({ executionId: 1 }, { unique: true });
researchExecutionSchema.index({ requestId: 1 }, { unique: true });
researchExecutionSchema.index({ sessionId: 1, createdAt: -1 });
researchExecutionSchema.index({ status: 1, updatedAt: -1 });
researchExecutionSchema.index({ sessionId: 1, planVersionId: 1 });

export const ResearchExecutionModel =
  mongoose.models.ResearchExecution ||
  mongoose.model<IResearchExecution>(
    "ResearchExecution",
    researchExecutionSchema,
  );
