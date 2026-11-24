import {
  StateGraph, // create a graph containing nodes and edges
  START,  // identifier represent begining of graph
  END,  // identifier represent ending of graph
  type CompiledStateGraph,  // Type representing the compiled, executable graph
} from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import {
  ResearchState,
  type ResearchStateType,
} from "../research-state";
import {
  researchGraphNodes,
  ResearchGraphNodes,
} from "./nodes";
import { logWorkflowError } from "../../../utils/api-error-handler";
import { researchExecutionRepository } from "../../../database/mongo/research-execution/researchExecutionModelRepo";
import {
  toResearchExecutionError,
  type ResearchExecutionEventName,
} from "../../../entities/research-execution/researchExecution";
import { AppError } from "../../../Error/appError";

/**
 * Service managing the compilation and execution of the LangGraph Research Workflow.
 * Coordinates Human-in-the-Loop plan approval/revision and DAG concurrent task execution.
 */
export class ResearchGraphWorkflow {
  private readonly nodes: ResearchGraphNodes;
  private readonly compiledGraph: CompiledStateGraph<
    ResearchStateType,
    Partial<ResearchStateType>,
    string
  >;

  constructor(nodes: ResearchGraphNodes = researchGraphNodes) {
    this.nodes = nodes;
    this.compiledGraph = this.buildWorkflow();
  }

  /**
   * Router evaluating where the workflow should begin:
   * 1. If edit_requested -> replanNode
   * 2. If approved -> route by document mode to retrieval or concurrent step execution
   * 3. Otherwise -> plannerNode (generates initial plan)
   */
  private routeEntry(
    state: ResearchStateType,
  ): "plannerNode" | "replanNode" | "retrievalNode" | "executeConcurrentResearchStepsNode" {
    if (state.planApprovalStatus === "edit_requested") {
      return "replanNode"; 
    }

    if (state.planApprovalStatus === "approved") {
      return this.nodes.routeByDocumentMode(state) === "retrievalNode"
        ? "retrievalNode"
        : "executeConcurrentResearchStepsNode";
    }

    return "plannerNode";
  }

  /**
   * Constructs the StateGraph, attaches planner, replanner, retrieval, concurrent DAG,
   * and answer nodes, and compiles the executable graph.
   */
  private buildWorkflow(): CompiledStateGraph<
    ResearchStateType,
    Partial<ResearchStateType>,
    string
  > {
    console.log("[ResearchGraphWorkflow] Building and compiling HITL research workflow...");

    const workflow = new StateGraph(ResearchState) // new workflow using ResearchState state
      .addNode("plannerNode", (state) =>
        this.runTrackedNode("plannerNode", state, () =>
          this.nodes.plannerNode(state),
        ),
      )
      .addNode("replanNode", (state) =>
        this.runTrackedNode("replanNode", state, () =>
          this.nodes.replanNode(state),
        ),
      )
      .addNode("retrievalNode", (state) =>
        this.runTrackedNode("retrievalNode", state, () =>
          this.nodes.retrievalNode(state),
        ),
      )
      .addNode("executeConcurrentResearchStepsNode", (state) =>
        this.runTrackedNode(
          "executeConcurrentResearchStepsNode",
          state,
          () => this.nodes.executeConcurrentResearchStepsNode(state),
        ),
      )
      .addNode("generateAnswerNode", (state) =>
        this.runTrackedNode("generateAnswerNode", state, () =>
          this.nodes.generateAnswerNode(state),
        ),
      )

      // Dynamic Entry Router
      .addConditionalEdges(
        START,
        (state) => this.routeEntry(state), // route entry will decide from which node the graph should start
        {
          plannerNode: "plannerNode",
          replanNode: "replanNode",
          retrievalNode: "retrievalNode",
          executeConcurrentResearchStepsNode: "executeConcurrentResearchStepsNode",
        },
      )

      // When planner or replan finishes, return plan to user for approval. so finish the execution otherwise graph will execute rest of the flow
      .addEdge("plannerNode", END)
      .addEdge("replanNode", END)

      // Execution Pipeline when plan is approved
      // move to executeConcurrentResearchStepsNode after retrievalNode
      .addEdge("retrievalNode", "executeConcurrentResearchStepsNode")
      // move to generateAnswerNode after executeConcurrentResearchStepsNode
      .addEdge("executeConcurrentResearchStepsNode", "generateAnswerNode")
      // finish flow after generateAnswerNode
      .addEdge("generateAnswerNode", END);

    return workflow.compile() as unknown as CompiledStateGraph<
      ResearchStateType,
      Partial<ResearchStateType>,
      string
    >;
  }

  private async runTrackedNode(
    eventId: ResearchExecutionEventName,
    state: ResearchStateType,
    runNode: () => Promise<Partial<ResearchStateType>> | Partial<ResearchStateType>,
  ): Promise<Partial<ResearchStateType>> {
    const executionId = state.executionId;
    const workerId = state.executionWorkerId;
    if (!executionId || !workerId) return runNode();

    const claim = await researchExecutionRepository.claimEvent(
      executionId,
      eventId,
      workerId,
    );
    if (claim === "completed") {
      const event = await researchExecutionRepository.getEvent(
        executionId,
        eventId,
      );
      if (!event?.result || typeof event.result !== "object") {
        throw new Error(
          `Completed research event "${eventId}" has no persisted result.`,
        );
      }
      return event.result as Partial<ResearchStateType>;
    }
    if (claim === "busy") {
      throw new AppError(
        `Research event "${eventId}" is currently claimed by another worker.`,
        409,
      );
    }

    const heartbeat = setInterval(() => {
      void researchExecutionRepository
        .heartbeatEvent(executionId, eventId, workerId)
        .then((alive) => {
          if (!alive) {
            console.error(
              `[ResearchExecution] Lease for event "${eventId}" is no longer owned by this worker.`,
            );
          }
        })
        .catch((error: unknown) => {
          console.error(
            `[ResearchExecution] Failed to heartbeat event "${eventId}":`,
            error,
          );
        });
    }, 30_000);

    try {
      if (
        eventId === "executeConcurrentResearchStepsNode" &&
        state.researchPlan?.length
      ) {
        await researchExecutionRepository.ensureSteps(
          executionId,
          state.researchPlan,
        );
      }
      const result = await runNode();
      await researchExecutionRepository.completeEvent(
        executionId,
        eventId,
        workerId,
        result as Record<string, unknown>,
      );
      return result;
    } catch (error: unknown) {
      await researchExecutionRepository.failEvent(
        executionId,
        eventId,
        workerId,
        toResearchExecutionError(error),
      );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * Returns the underlying compiled LangGraph instance. allow other part of application to use compiled graph instant
   */
  public getCompiledGraph(): CompiledStateGraph<
    ResearchStateType,
    Partial<ResearchStateType>,
    string
  > {
    return this.compiledGraph;
  }

  /**
   * Invokes the compiled LangGraph workflow with an input state payload.
   * initialState: it passes the user's query data to the system
   */
  public async run(
    initialState: Partial<ResearchStateType>,
  ): Promise<ResearchStateType> {
    console.log(
      `[ResearchGraphWorkflow] Executing graph for status: "${initialState.planApprovalStatus || "initial"}" (mode: ${initialState.documentMode || "none"})...`,
    );

    try {
      return (await this.compiledGraph.invoke(
        initialState.executionId
          ? {
              ...initialState,
              executionWorkerId:
                initialState.executionWorkerId ??
                randomUUID(),
            }
          : initialState,
      )) as ResearchStateType;
    } catch (error: unknown) {
      logWorkflowError("ResearchGraphWorkflow", error, {
        planApprovalStatus: initialState.planApprovalStatus,
        documentMode: initialState.documentMode,
        query: initialState.query,
      });
      throw error;
    }
  }

  /**
   * Helper: Generates initial plan for query/document (Awaiting Approval)
   */
  public async generatePlan(
    state: Partial<ResearchStateType>,
  ): Promise<ResearchStateType> {
    return this.run({
      ...state,
      planApprovalStatus: "awaiting_approval",
    });
  }

  /**
   * Helper: Revises existing plan according to user feedback (Awaiting Approval)
   */
  public async revisePlan(
    state: Partial<ResearchStateType>,
    userPlanEdits: string,
  ): Promise<ResearchStateType> {
    return this.run({
      ...state,
      userPlanEdits,
      planApprovalStatus: "edit_requested",
    });
  }

  /**
   * Helper: Executes approved research plan concurrently (DAG) and generates final answer
   */
  public async executeApprovedPlan(
    state: Partial<ResearchStateType>,
  ): Promise<ResearchStateType> {
    return this.run({
      ...state,
      planApprovalStatus: "approved",
    });
  }
}

export const researchGraphWorkflow = new ResearchGraphWorkflow();
export const researchGraph = researchGraphWorkflow.getCompiledGraph();
