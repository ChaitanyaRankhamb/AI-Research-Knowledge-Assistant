import mongoose, {
  Schema,
  Document,
  Types,
} from "mongoose";

export interface IResearchPlanStep {
  stepId: string;
  title: string;
  description: string;
  dependsOn: string[];
}

export type PlanCreatedBy = "ai" | "user";

export type PlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "superseded"
  | "rejected";

export interface IResearchPlanVersion extends Document {
  sessionId: Types.ObjectId;

  version: number;
  basedOnVersion: number | null;

  createdBy: PlanCreatedBy;
  status: PlanStatus;

  plan: {
    title: string;
    objective: string;
    steps: IResearchPlanStep[];
  };

  changeSummary?: string;

  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const researchPlanStepSchema =
  new Schema<IResearchPlanStep>(
    {
      stepId: {
        type: String,
        required: true,
      },

      title: {
        type: String,
        required: true,
        trim: true,
      },

      description: {
        type: String,
        required: true,
      },

      dependsOn: {
        type: [String],
        default: [],
      },
    },
    {
      _id: false,
    }
  );

const researchPlanVersionSchema =
  new Schema<IResearchPlanVersion>(
    {
      sessionId: {
        type: Schema.Types.ObjectId,
        ref: "ResearchSession",
        required: true,
      },

      version: {
        type: Number,
        required: true,
        min: 1,
      },

      basedOnVersion: {
        type: Number,
        default: null,
      },

      createdBy: {
        type: String,
        enum: ["ai", "user"],
        required: true,
      },

      status: {
        type: String,
        enum: [
          "draft",
          "pending_approval",
          "approved",
          "superseded",
          "rejected",
        ],
        default: "draft",
        required: true,
      },

      plan: {
        title: {
          type: String,
          required: true,
          trim: true,
        },

        objective: {
          type: String,
          required: true,
        },

        steps: {
          type: [researchPlanStepSchema],
          default: [],
        },
      },

      changeSummary: {
        type: String,
        default: null,
      },

      approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      approvedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
      versionKey: "__v",
    }
  );

// A session cannot have duplicate version numbers.
researchPlanVersionSchema.index(
  {
    sessionId: 1,
    version: 1,
  },
  {
    unique: true,
  }
);

export const ResearchPlanVersionModel =
  mongoose.models.ResearchPlanVersion ||
  mongoose.model<IResearchPlanVersion>(
    "ResearchPlanVersion",
    researchPlanVersionSchema
  );
