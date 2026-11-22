import {
  vectorStoreService,
  type VectorStoreService,
} from "../../langchain/vector-store/vector-store.service";
import type { ResearchStateType } from "../../research-state";
import { logWorkflowError, WorkflowError } from "../../../../utils/api-error-handler";

export async function retrievalNode(
  state: ResearchStateType,
  vectorStore: VectorStoreService = vectorStoreService,
): Promise<Partial<ResearchStateType>> {
  const documentId = state.document?.documentId;
  console.log(
    `[LangGraph Node: retrievalNode] Retrieving relevant chunks for query: "${state.query}" (documentId: ${documentId || "global"})...`,
  );

  const filter = documentId ? { documentId } : undefined;
  let matches;
  try {
    matches = await vectorStore.searchSimilar(state.query, 5, filter);
  } catch (error: unknown) {
    const formatted = logWorkflowError("retrievalNode", error, {
      query: state.query,
      documentId,
      documentFileName: state.document?.fileName,
    });
    throw new WorkflowError(formatted);
  }

  const retrievedChunks = matches.map((match, index) => {
    const pageInfo = match.metadata.page
      ? `Page ${match.metadata.page}`
      : "Page unavailable";
    const sourceInfo = match.metadata.source
      ? `, Source: ${match.metadata.source}`
      : "";

    return `[Evidence #${index + 1}, ${pageInfo}${sourceInfo}]:\n${match.pageContent.trim()}`;
  });

  console.log(
    `[LangGraph Node: retrievalNode] Retrieved ${retrievedChunks.length} matching chunk(s) from Qdrant.`,
  );

  return { retrievedChunks };
}
