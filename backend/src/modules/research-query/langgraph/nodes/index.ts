import { llmService, type LlmService } from "../../llm/llm.service";
import {
  vectorStoreService,
  type VectorStoreService,
} from "../../langchain/vector-store/vector-store.service";
import type { ResearchStateType } from "../../research-state";
import { plannerNode } from "./planner.node.js";
import { replanNode } from "./replan.node.js";
import { generateAnswerNode } from "./generate-answer.node.js";
import {
  executeConcurrentResearchStepsNode,
  executeResearchStepNode,
} from "./execute-research-step.node.js";
import { prepareResearchStepNode } from "./prepare-research-step.node.js";
import { retrievalNode } from "./retrieval.node.js";
import { routeByDocumentMode } from "./route-by-document-mode";
import { routeAfterResearchStep } from "./route-after-research-step";

export class ResearchGraphNodes {
  constructor(
    private readonly llm: LlmService = llmService,
    private readonly vectorStore: VectorStoreService = vectorStoreService,
  ) {}

  public plannerNode(state: ResearchStateType) {
    return plannerNode(state, this.llm);
  }

  public replanNode(state: ResearchStateType) {
    return replanNode(state, this.llm);
  }

  public routeByDocumentMode(state: ResearchStateType) {
    return routeByDocumentMode(state);
  }

  public prepareResearchStepNode(state: ResearchStateType) {
    return prepareResearchStepNode(state);
  }

  public executeConcurrentResearchStepsNode(state: ResearchStateType) {
    return executeConcurrentResearchStepsNode(state, this.llm);
  }

  public executeResearchStepNode(state: ResearchStateType) {
    return executeResearchStepNode(state, this.llm);
  }

  public routeAfterResearchStep(state: ResearchStateType) {
    return routeAfterResearchStep(state);
  }

  public retrievalNode(state: ResearchStateType) {
    return retrievalNode(state, this.vectorStore);
  }

  public generateAnswerNode(state: ResearchStateType) {
    return generateAnswerNode(state, this.llm);
  }
}

export const researchGraphNodes = new ResearchGraphNodes();

export {
  plannerNode,
  replanNode,
  retrievalNode,
  executeConcurrentResearchStepsNode,
  executeResearchStepNode,
  prepareResearchStepNode,
  generateAnswerNode,
  routeByDocumentMode,
  routeAfterResearchStep,
};
