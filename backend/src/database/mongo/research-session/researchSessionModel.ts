import mongoose, { Schema, Document, Types } from "mongoose";

export type ResearchStatus =
  | "planning"
  | "awaiting_plan_approval"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface IResearchSession extends Document {
  userId: Types.ObjectId;

  title: string;
  generatedName?: string | null;
  customTitle?: string | null;
  initialQuery: string;

  status: ResearchStatus;

  currentPlanVersion: number;

  pendingPlanVersionId: Types.ObjectId | null;
  activePlanVersionId: Types.ObjectId | null;

  messageCount: number;

  completedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const researchSessionSchema = new Schema<IResearchSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    generatedName: {
      type: String,
      trim: true,
      default: null,
    },

    customTitle: {
      type: String,
      trim: true,
      default: null,
      maxlength: 80,
    },

    initialQuery: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "planning",
        "awaiting_plan_approval",
        "executing",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "planning",
      required: true,
    },

    currentPlanVersion: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingPlanVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchPlanVersion",
      default: null,
    },

    activePlanVersionId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchPlanVersion",
      default: null,
    },

    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  }
);

// Indexes
researchSessionSchema.index({
  userId: 1,
  updatedAt: -1,
});

export const ResearchSessionModel =
  mongoose.models.ResearchSession ||
  mongoose.model<IResearchSession>(
    "ResearchSession",
    researchSessionSchema
  );
