"use client";

import * as React from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Layers,
  Check,
  Edit3,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import type { ResearchPlanStep } from "@/components/api/research-query.api";

interface ResearchPlanCardProps {
  steps: ResearchPlanStep[];
  planApprovalStatus?: "awaiting_approval" | "edit_requested" | "approved";
  planIterationCount?: number;
  onApprovePlan?: () => void;
  onEditPlan?: (feedback: string) => void;
  isActionLoading?: boolean;
  defaultExpanded?: boolean;
}

export function ResearchPlanCard({
  steps,
  planApprovalStatus = "approved",
  planIterationCount = 1,
  onApprovePlan,
  onEditPlan,
  isActionLoading = false,
  defaultExpanded = true,
}: ResearchPlanCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const [isEditing, setIsEditing] = React.useState(false);
  const [userEdits, setUserEdits] = React.useState("");

  if (!steps || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const isAllCompleted = completedCount === steps.length;
  const inProgressStep = steps.find((s) => s.status === "in_progress");
  const isAwaitingApproval =
    planApprovalStatus === "awaiting_approval" ||
    planApprovalStatus === "edit_requested";

  const handleSendEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEdits.trim() || isActionLoading) return;
    onEditPlan?.(userEdits.trim());
    setIsEditing(false);
    setUserEdits("");
  };

  return (
    <div className="mb-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs shadow-xs transition-all overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/20 border-b border-border/40">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex flex-1 items-center gap-2 min-w-0 text-left hover:opacity-85 transition-opacity"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Layers className="size-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">
            Research Plan
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] h-4.5 px-1.5 font-mono ${
              isAwaitingApproval
                ? "border-warning/30 text-warning bg-warning/10"
                : isAllCompleted
                ? "border-success/30 text-success bg-success/10"
                : "border-info/30 text-info bg-info/10"
            }`}
          >
            {isAwaitingApproval
              ? `Awaiting Review ${planIterationCount > 1 ? `(v${planIterationCount})` : ""}`
              : isAllCompleted
              ? "All Steps Complete"
              : inProgressStep
              ? `Step ${steps.indexOf(inProgressStep) + 1} of ${steps.length} in progress`
              : `${completedCount}/${steps.length} complete`}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1.5 text-muted-foreground shrink-0 ml-2 hover:text-foreground text-[11px]"
        >
          <span className="hidden sm:inline">
            {isExpanded ? "Hide details" : "View steps"}
          </span>
          {isExpanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
      </div>

      {/* Steps List */}
      {isExpanded && (
        <div className="px-3.5 py-3 space-y-2.5 animate-in fade-in duration-200">
          {steps.map((step, idx) => (
            <div
              key={step.id || idx}
              className="rounded-lg border border-border/40 bg-background/50 p-2.5"
            >
              <span className="text-xs font-medium text-foreground">
                {step.title}
              </span>
              {step.description && (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/90">
                  {step.description}
                </p>
              )}
            </div>
          ))}

          {/* HITL Approval / Edit Action Controls */}
          {isAwaitingApproval && (
            <div className="pt-2 border-t border-border/40">
              {!isEditing ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 rounded-lg bg-muted/30 p-2.5 border border-border/60">
                  <div className="text-xs text-muted-foreground text-center sm:text-left">
                    <span className="font-medium text-foreground">
                      Review Research Plan:
                    </span>{" "}
                    Approve to execute concurrent analysis, or edit tasks.
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isActionLoading}
                      onClick={() => setIsEditing(true)}
                      className="h-8 text-xs gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="size-3.5" />
                      Edit Plan
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={isActionLoading}
                      onClick={() => onApprovePlan?.()}
                      className="h-8 text-xs gap-1.5 cursor-pointer font-medium"
                    >
                      {isActionLoading ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Check className="size-3.5" />
                          Approve & Execute
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSendEdits}
                  className="rounded-lg bg-muted/30 p-3 border border-border/60 space-y-2.5 animate-in fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Edit3 className="size-3.5 text-primary" />
                      Provide Feedback or Changes to Plan
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <textarea
                    value={userEdits}
                    onChange={(e) => setUserEdits(e.target.value)}
                    placeholder="e.g., Focus more on libuv worker pool, remove step 4, or add performance benchmarks..."
                    rows={2}
                    disabled={isActionLoading}
                    className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring resize-none"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isActionLoading}
                      onClick={() => setIsEditing(false)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="default"
                      size="sm"
                      disabled={isActionLoading || !userEdits.trim()}
                      className="h-7 text-xs gap-1.5"
                    >
                      {isActionLoading ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Send className="size-3" />
                      )}
                      Update Plan
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
