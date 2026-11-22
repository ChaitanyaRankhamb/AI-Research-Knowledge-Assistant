"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  Copy,
  Check,
  FileText,
  Loader2,
  Atom,
  Globe,
  ExternalLink,
  Terminal,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { ResearchPlanCard } from "./research-plan-card";
import type { AttachedDocument } from "../research-query-bar";
import type {
  ResearchPlanStep,
  WebSearchResult,
} from "@/components/api/research-query.api";

export interface ResearchMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachedDocs?: AttachedDocument[];
  researchPlan?: ResearchPlanStep[];
  planApprovalStatus?: "awaiting_approval" | "edit_requested" | "approved";
  planIterationCount?: number;
  searchResults?: WebSearchResult[];
  retrievedChunks?: string[];
  createdAt: string;
}

interface ConversationFeedProps {
  messages: ResearchMessage[];
  isLoading?: boolean;
  onApprovePlan?: (messageId: string, plan: ResearchPlanStep[]) => void;
  onEditPlan?: (messageId: string, plan: ResearchPlanStep[], feedback: string) => void;
  onSelectCitation?: (chunkIndex: number) => void;
}

/**
 * Helper to recursively extract plain text from React nodes for copying
 */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return "";
}

/**
 * Dedicated Code Block Component with language tag, syntax highlighting & 1-click copy button
 */
function CodeBlockView({
  language,
  className,
  children,
}: {
  language: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyCode = async () => {
    try {
      const codeText = extractText(children).replace(/\n$/, "");
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code snippet:", err);
    }
  };

  return (
    <div className="my-3.5 rounded-xl border border-code-border bg-code text-code-foreground overflow-hidden shadow-xs">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-code-header border-b border-code-border text-xs text-code-header-foreground">
        <div className="flex items-center gap-1.5 font-mono text-[11px] lowercase">
          <Terminal className="size-3 text-code-header-foreground" />
          <span>{language || "code"}</span>
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-code-border text-[11px] text-code-foreground transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="size-3 text-success" />
              <span className="text-success font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body with rehype-highlight styling */}
      <div className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed text-code-foreground">
        <pre className="!=bg-transparent! p-0! m-0! font-mono">
          <code className={className || `hljs ${language ? `language-${language}` : ""}`}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}

/**
 * Extract clean domain from URL (e.g., "builder.io", "nodejs.org")
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Sources Showcase (Copilot & Perplexity style)
 */
function WebSourcesBar({ sources }: { sources: WebSearchResult[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
        <Globe className="size-3.5 text-primary" />
        <span>Sources & References ({sources.length})</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar flex-wrap">
        {sources.map((src, idx) => {
          const domain = extractDomain(src.url);
          return (
            <a
              key={idx}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card/80 hover:bg-muted/70 border border-border/70 hover:border-primary/30 transition-all text-xs max-w-55 shrink-0"
              title={`${src.title}\n${src.url}`}
            >
              <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-mono font-bold">
                {idx + 1}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-foreground truncate text-[11px] group-hover:text-primary transition-colors">
                  {src.title}
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  {domain}
                </span>
              </div>
              <ExternalLink className="size-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ConversationFeed({
  messages,
  isLoading = false,
  onApprovePlan,
  onEditPlan,
  onSelectCitation,
}: ConversationFeedProps) {
  const feedEndRef = React.useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
    }
  };

  return (
    <div className="space-y-6 px-4 py-6 pb-44">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isCopied = copiedId === message.id;

        return (
          <div
            key={message.id}
            className={`flex items-start gap-3 max-w-4xl mx-auto ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`flex flex-col ${
                isUser ? "max-w-[75%] sm:max-w-[65%] items-end" : "w-full items-start"
              }`}
            >
              {/* User message layout */}
              {isUser ? (
                <div className="flex flex-col items-end gap-2">
                  {/* Attached Documents Chips */}
                  {message.attachedDocs && message.attachedDocs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      {message.attachedDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted text-foreground text-xs font-medium border border-border"
                        >
                          <FileText className="size-3 shrink-0" />
                          <span className="truncate max-w-35">
                            {doc.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ({doc.size})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* User query bubble */}
                  <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground text-sm shadow-xs leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              ) : (
                /* Assistant response layout (ChatGPT & Microsoft Copilot style) */
                <div className="w-full flex flex-col gap-2">
                  {/* Web Sources Grid/Carousel */}
                  {message.searchResults && message.searchResults.length > 0 && (
                    <WebSourcesBar sources={message.searchResults} />
                  )}

                  {/* Research Plan Card (with HITL Approval / Edit controls) */}
                  {message.researchPlan && message.researchPlan.length > 0 && (
                    <ResearchPlanCard
                      steps={message.researchPlan}
                      planApprovalStatus={message.planApprovalStatus}
                      planIterationCount={message.planIterationCount}
                      isActionLoading={isLoading}
                      onApprovePlan={() =>
                        onApprovePlan?.(message.id, message.researchPlan || [])
                      }
                      onEditPlan={(feedback) =>
                        onEditPlan?.(
                          message.id,
                          message.researchPlan || [],
                          feedback,
                        )
                      }
                    />
                  )}

                  {/* Structured Markdown Answer (ChatGPT & Microsoft Copilot rendering) */}
                  {message.content && (
                    <div className="rounded-2xl px-1 py-1 text-sm text-foreground leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          h1: ({ ...props }) => (
                            <h1
                              className="text-xl font-bold tracking-tight text-foreground mt-6 mb-3"
                              {...props}
                            />
                          ),
                          h2: ({ ...props }) => (
                            <h2
                              className="text-lg font-bold tracking-tight text-foreground mt-5 mb-2.5 pb-1 border-b border-border/40"
                              {...props}
                            />
                          ),
                          h3: ({ ...props }) => (
                            <h3
                              className="text-base font-semibold text-foreground mt-4 mb-2"
                              {...props}
                            />
                          ),
                          p: ({ ...props }) => (
                            <p
                              className="leading-relaxed mb-3 text-sm text-foreground/90"
                              {...props}
                            />
                          ),
                          ul: ({ ...props }) => (
                            <ul
                              className="list-disc pl-5 mb-3 space-y-1.5 text-sm text-foreground/90"
                              {...props}
                            />
                          ),
                          ol: ({ ...props }) => (
                            <ol
                              className="list-decimal pl-5 mb-3 space-y-1.5 text-sm text-foreground/90"
                              {...props}
                            />
                          ),
                          li: ({ ...props }) => (
                            <li className="leading-relaxed" {...props} />
                          ),
                          blockquote: ({ ...props }) => (
                            <blockquote
                              className="border-l-4 border-primary/80 bg-muted/50 px-3.5 py-2.5 my-3.5 rounded-r-xl text-sm text-foreground/90"
                              {...props}
                            />
                          ),
                          table: ({ ...props }) => (
                            <div className="my-4 overflow-x-auto rounded-xl border border-border shadow-xs">
                              <table
                                className="w-full text-xs text-left border-collapse"
                                {...props}
                              />
                            </div>
                          ),
                          thead: ({ ...props }) => (
                            <thead className="bg-muted/60" {...props} />
                          ),
                          th: ({ ...props }) => (
                            <th
                              className="px-3.5 py-2.5 font-semibold text-foreground border-b border-border"
                              {...props}
                            />
                          ),
                          td: ({ ...props }) => (
                            <td
                              className="px-3.5 py-2 border-b border-border/40 text-foreground/85"
                              {...props}
                            />
                          ),
                          a: ({ href, children, ...props }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-primary hover:underline font-medium text-xs align-baseline"
                              {...props}
                            >
                              <span>{children}</span>
                              <ExternalLink className="size-2.5 inline shrink-0 ml-0.5" />
                            </a>
                          ),
                          pre: ({ children }) => <>{children}</>,
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            const isInline = !className && !match && typeof children === "string" && !children.includes("\n");

                            if (isInline) {
                              return (
                                <code
                                  className="px-1.5 py-0.5 rounded-md font-mono text-[12px] bg-muted/80 text-foreground border border-border/50"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }

                            const lang = match ? match[1] : "";

                            return (
                              <CodeBlockView
                                language={lang}
                                className={className}
                              >
                                {children}
                              </CodeBlockView>
                            );
                          },
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Response Actions Toolbar */}
                  <div className="flex items-center gap-2 pt-1 px-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopy(message.id, message.content)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Copy response"
                    >
                      {isCopied ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>

                    {message.retrievedChunks &&
                      message.retrievedChunks.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4.5 px-2 rounded-full border-border bg-muted/30 text-muted-foreground cursor-pointer hover:bg-muted/60"
                          onClick={() => onSelectCitation?.(0)}
                        >
                          {message.retrievedChunks.length} document citation(s)
                        </Badge>
                      )}

                    {message.searchResults &&
                      message.searchResults.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4.5 px-2 rounded-full border-success/30 bg-success/10 text-success font-mono"
                        >
                          {message.searchResults.length} web sources verified
                        </Badge>
                      )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Loading & Synthesizing Indicator */}
      {isLoading && (
        <div className="flex items-start gap-3 max-w-4xl mx-auto">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs mt-0.5 animate-pulse">
            <Atom className="size-4.5 animate-spin" />
          </div>

          <div className="flex flex-col gap-2 w-full max-w-lg">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="size-3.5 animate-spin" />
              <span>
                Searching knowledge sources and executing research tasks...
              </span>
            </div>

            <div className="rounded-2xl p-4 bg-card/60 border border-border/60 space-y-2.5">
              <div className="h-3.5 bg-muted/80 rounded-md animate-pulse w-3/4" />
              <div className="h-3.5 bg-muted/80 rounded-md animate-pulse w-full" />
              <div className="h-3.5 bg-muted/80 rounded-md animate-pulse w-5/6" />
            </div>
          </div>
        </div>
      )}

      <div ref={feedEndRef} />
    </div>
  );
}
