"use client";

import * as React from "react";
import {
  Paperclip,
  Mic,
  ArrowUp,
  FileText,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export interface AttachedDocument {
  id: string;
  name: string;
  size: string;
  file?: File;
}

interface ResearchQueryBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string, attachedDocs: AttachedDocument[]) => void;
  attachedDocs: AttachedDocument[];
  onAddDocs: (docs: AttachedDocument[]) => void;
  onRemoveDoc: (id: string) => void;
  placeholder?: string;
  isLoading?: boolean;
}

export function ResearchQueryBar({
  value,
  onChange,
  onSubmit,
  attachedDocs,
  onAddDocs,
  onRemoveDoc,
  placeholder = "Ask a deep research question, summarize findings, or explore your documents...",
  isLoading = false,
}: ResearchQueryBarProps) {
  const [isListening, setIsListening] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const isMultiline = value.length >= 80;

  // Auto-resize textarea as user types
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const height = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${height}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((value.trim() || attachedDocs.length > 0) && !isLoading) {
        onSubmit(value.trim(), attachedDocs);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newDocs: AttachedDocument[] = Array.from(files).map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      file,
    }));

    onAddDocs(newDocs);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleVoiceRecording = () => {
  };

  const canSubmit = (value.trim().length > 0 || attachedDocs.length > 0) && !isLoading;

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {/* Main Query Bar Container */}
      <div
        className={`relative flex flex-col rounded-3xl bg-card border border-border/80 shadow-lg shadow-black/5 dark:shadow-black/25 transition-all duration-200 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 ${
          isListening ? "border-destructive ring-2 ring-destructive/20" : ""
        }`}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt,.csv"
          onChange={handleFileUpload}
          className="hidden"
          id="research-doc-upload"
        />

        {/* Attached Documents Chips */}
        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-1">
            {attachedDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-secondary border border-border text-secondary-foreground text-xs font-medium animate-fadeIn"
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate max-w-42.5" title={doc.name}>
                  {doc.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({doc.size})
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveDoc(doc.id)}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Remove document"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className={`flex gap-2 px-3 pt-3 pb-2 ${
            isMultiline ? "flex-col" : "items-end"
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? "Listening... Speak your research query now"
                : placeholder
            }
            className={`min-w-0 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none leading-relaxed min-h-11 max-h-45 ${
              isMultiline ? "w-full flex-none" : "flex-1"
            }`}
          />

          <div
            className={`flex items-center gap-2 ${
              isMultiline ? "w-full justify-between" : "shrink-0"
            }`}
          >
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-full font-normal border border-transparent transition-colors cursor-pointer"
                  aria-label="Choose research documents"
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  {attachedDocs.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-0.5 h-4 px-1.5 text-[10px] bg-secondary text-secondary-foreground border-none font-mono"
                    >
                      {attachedDocs.length}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Upload PDFs, DOCX, or research notes
              </TooltipContent>
            </Tooltip>

            <div className="ml-auto flex items-center gap-2">
              {isListening && (
                <span className="text-[11px] text-destructive font-medium animate-pulse hidden sm:inline">
                  Recording audio...
                </span>
              )}

              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleVoiceRecording}
                    className={`rounded-full transition-all cursor-pointer ${
                      isListening
                        ? "bg-destructive/10 text-destructive border border-destructive/30 animate-pulse"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    aria-label="Voice detection"
                  >
                    {isListening ? (
                      <Mic className="size-4 text-destructive" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isListening ? "Listening... click to stop" : "Voice query input"}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <Button
                    type="button"
                    size="icon-sm"
                    disabled={!canSubmit}
                    onClick={() => onSubmit(value.trim(), attachedDocs)}
                    className={`size-8 rounded-full transition-all ${
                      canSubmit
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:scale-105"
                        : "bg-muted text-muted-foreground/60 cursor-not-allowed opacity-60"
                    }`}
                    aria-label="Send research query"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowUp className="size-4 stroke-[2.5]" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Send query (Enter)</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
