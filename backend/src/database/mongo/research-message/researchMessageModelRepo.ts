import { ClientSession, Types } from "mongoose";
import { ResearchMessage } from "../../../entities/research-message/researchMessage";
import { ResearchMessageId } from "../../../entities/research-message/researchMessageId";
import {
  CreateResearchMessageData,
  IResearchMessageRepository,
} from "../../../entities/research-message/researchMessageRepo";
import { ResearchSessionId } from "../../../entities/research-session/researchSessionId";
import { PaginationOptions } from "../../../entities/research-session/researchSessionRepo";
import { UserId } from "../../../entities/user/userId";
import {
  IResearchMessage,
  ResearchMessageModel,
} from "./researchMessageModel";

/**
 * Maps a Mongoose ResearchMessage document to a domain ResearchMessage entity.
 */
function docToMessage(doc: IResearchMessage): ResearchMessage {
  return new ResearchMessage(
    new ResearchMessageId(doc._id.toString()),
    new ResearchSessionId(doc.sessionId.toString()),
    new UserId(doc.userId.toString()),
    doc.sequence,
    doc.role,
    doc.content,
    (doc.sources || []).map((s) => ({
      sourceId: s.sourceId,
      title: s.title,
      url: s.url,
      snippet: s.snippet,
      documentId: s.documentId,
      chunkId: s.chunkId,
      retrievalScore: s.retrievalScore,
    })),
    doc.executionId,
    doc.metadata
      ? {
          model: doc.metadata.model,
          inputTokens: doc.metadata.inputTokens,
          outputTokens: doc.metadata.outputTokens,
        }
      : null,
    doc.createdAt,
    doc.updatedAt,
    doc.planVersionId?.toString() ?? null,
  );
}

/**
 * MongoDB Mongoose implementation of the ResearchMessage repository.
 */
export class MongoResearchMessageRepository
  implements IResearchMessageRepository
{
  /**
   * Persists a newly created user, assistant, or tool research message.
   */
  async createMessage(
    data: CreateResearchMessageData,
    session?: unknown,
  ): Promise<ResearchMessage> {
    const clientSession = session as ClientSession | undefined;
    const doc = new ResearchMessageModel({
      sessionId: new Types.ObjectId(data.sessionId),
      userId: new Types.ObjectId(data.userId),
      sequence: data.sequence,
      role: data.role,
      content: data.content,
      sources: (data.sources || []).map((s) => ({
        sourceId: s.sourceId,
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        documentId: s.documentId,
        chunkId: s.chunkId,
        retrievalScore: s.retrievalScore,
      })),
      executionId: data.executionId ?? null,
      planVersionId: data.planVersionId
        ? new Types.ObjectId(data.planVersionId)
        : null,
      metadata: data.metadata ?? undefined,
    });

    await doc.save({ session: clientSession });
    return docToMessage(doc);
  }

  /**
   * Finds a single message by ID.
   */
  async findById(
    id: string,
    session?: unknown,
  ): Promise<ResearchMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const clientSession = session as ClientSession | undefined;
    const doc = await ResearchMessageModel.findById(id).session(
      clientSession ?? null,
    );
    return doc ? docToMessage(doc) : null;
  }

  /**
   * Retrieves messages for a session ordered sequentially.
   * Useful for loading chat history when opening a conversation.
   */
  async findBySessionId(
    sessionId: string,
    options?: PaginationOptions,
    session?: unknown,
  ): Promise<ResearchMessage[]> {
    if (!Types.ObjectId.isValid(sessionId)) return [];

    const clientSession = session as ClientSession | undefined;
    const sortOrder = options?.sortOrder === "desc" ? -1 : 1;
    const query = ResearchMessageModel.find({
      sessionId: new Types.ObjectId(sessionId),
    })
      .sort({ sequence: sortOrder })
      .session(clientSession ?? null);

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.limit) {
      query.limit(options.limit);
    }

    const docs = await query.exec();
    return docs.map(docToMessage);
  }

  /**
   * Calculates the next sequence number for a new message in a session.
   * Atomically prevents sequence collision.
   */
  async getNextSequence(
    sessionId: string,
    session?: unknown,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 1;

    const clientSession = session as ClientSession | undefined;
    const lastMsg = await ResearchMessageModel.findOne({
      sessionId: new Types.ObjectId(sessionId),
    })
      .sort({ sequence: -1 })
      .select("sequence")
      .session(clientSession ?? null)
      .lean();

    return lastMsg ? lastMsg.sequence + 1 : 1;
  }

  /**
   * Counts the number of messages in a session.
   */
  async countBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 0;

    const clientSession = session as ClientSession | undefined;
    return ResearchMessageModel.countDocuments(
      { sessionId: new Types.ObjectId(sessionId) },
      { session: clientSession },
    );
  }

  /**
   * Deletes all messages in a session.
   */
  async deleteBySessionId(
    sessionId: string,
    session?: unknown,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(sessionId)) return 0;

    const clientSession = session as ClientSession | undefined;
    const result = await ResearchMessageModel.deleteMany(
      {
        sessionId: new Types.ObjectId(sessionId),
      },
      { session: clientSession },
    );

    return result.deletedCount;
  }
}

export const researchMessageRepository =
  new MongoResearchMessageRepository();
