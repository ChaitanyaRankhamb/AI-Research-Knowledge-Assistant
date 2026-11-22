import mongoose, {
  Schema,
  Document,
  Types,
} from "mongoose";

export type MessageRole =
  | "user"
  | "assistant"
  | "tool";

export interface IMessageSource {
  sourceId: string;
  title: string;
  url?: string;
  snippet?: string;

  documentId?: string;
  chunkId?: string;

  retrievalScore?: number;
}

export interface IResearchMessage extends Document {
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;

  sequence: number;

  role: MessageRole;
  content: string;

  sources: IMessageSource[];

  executionId?: string;
  planVersionId?: Types.ObjectId | null;

  metadata?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const messageSourceSchema =
  new Schema<IMessageSource>(
    {
      sourceId: {
        type: String,
        required: true,
      },

      title: {
        type: String,
        required: true,
      },

      url: String,

      snippet: String,

      documentId: String,

      chunkId: String,

      retrievalScore: {
        type: Number,
        min: 0,
        max: 1,
      },
    },
    {
      _id: false,
    }
  );

const researchMessageSchema =
  new Schema<IResearchMessage>(
    {
      sessionId: {
        type: Schema.Types.ObjectId,
        ref: "ResearchSession",
        required: true,
      },

      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      sequence: {
        type: Number,
        required: true,
        min: 1,
      },

      role: {
        type: String,
        enum: ["user", "assistant", "tool"],
        required: true,
      },

      content: {
        type: String,
        required: true,
      },

      sources: {
        type: [messageSourceSchema],
        default: [],
      },

      executionId: {
        type: String,
        default: null,
      },

      planVersionId: {
        type: Schema.Types.ObjectId,
        ref: "ResearchPlanVersion",
        default: null,
      },

      metadata: {
        model: String,
        inputTokens: Number,
        outputTokens: Number,
      },
    },
    {
      timestamps: true,
      versionKey: "__v",
    }
  );

// Maintain message ordering and prevent duplicate sequence numbers.
researchMessageSchema.index(
  {
    sessionId: 1,
    sequence: 1,
  },
  {
    unique: true,
  }
);

export const ResearchMessageModel =
  mongoose.models.ResearchMessage ||
  mongoose.model<IResearchMessage>(
    "ResearchMessage",
    researchMessageSchema
  );
