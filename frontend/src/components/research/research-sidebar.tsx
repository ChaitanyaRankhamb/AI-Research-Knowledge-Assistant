"use client";

import * as React from "react";
import {
  PanelLeftClose,
  PanelLeft,
  SquarePen,
  Search,
  LogIn,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useUser } from "@/context/UserContext";
import { AccountMenu } from "@/src/components/auth/account-menu";
interface ResearchSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeChatId?: string;
  sessions?: {
    id: string;
    displayName: string;
    namingStatus?: "naming" | "ready" | "failed";
  }[];
  sessionsLoading?: boolean;
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
  onRenameSession?: (id: string, title: string) => Promise<boolean>;
  onDeleteSession?: (id: string) => Promise<boolean>;
}

export function ResearchSidebar({
  isOpen,
  onToggle,
  activeChatId = "1",
  sessions = [],
  sessionsLoading = false,
  onSelectChat,
  onNewChat,
  onRenameSession,
  onDeleteSession,
}: ResearchSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(
    null,
  );
  const [editingTitle, setEditingTitle] = React.useState("");
  const [isSavingRename, setIsSavingRename] = React.useState(false);
  const [sessionToDelete, setSessionToDelete] = React.useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const { isLogged, isLoading } = useUser();
  const filteredSessions = sessions.filter((session) =>
    session.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  const beginRename = (session: (typeof sessions)[number]) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.displayName);
  };

  const saveRename = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = editingTitle.trim();
    if (!editingSessionId || !title || isSavingRename) return;

    setIsSavingRename(true);
    try {
      if (await onRenameSession?.(editingSessionId, title)) {
        setEditingSessionId(null);
      }
    } finally {
      setIsSavingRename(false);
    }
  };

  const confirmDelete = async () => {
    if (!sessionToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      if (await onDeleteSession?.(sessionToDelete.id)) {
        setSessionToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <aside
      className={`relative flex flex-col h-dvh min-h-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out shrink-0 select-none ${
        isOpen
          ? "w-65 md:w-70"
          : "w-0 -translate-x-full overflow-hidden border-none md:w-16 md:translate-x-0 md:border-sidebar-border"
      }`}
    >
      {/* Top Bar: Logo, App Name & Composer/Collapse Toggles */}
      <div
        className={`flex items-center border-b border-sidebar-border/60 ${
          isOpen ? "justify-between px-3 py-3.5" : "justify-center p-3"
        }`}
      >
        {isOpen && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-sm tracking-tight truncate text-sidebar-foreground">
                  Research AI
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground truncate">
                Research & Knowledge Assistant
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5">
          {/* Width / Sidebar Collapse Toggle */}
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer"
                aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {isOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeft className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isOpen ? "Collapse sidebar" : "Expand sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Primary Action: New Chat Button */}
      <div
        className={`pb-2 ${
          isOpen
            ? "space-y-2 p-3"
            : "flex flex-col items-center gap-2 px-2 pt-3"
        }`}
      >
        {isOpen ? (
          <Button
            variant="outline"
            onClick={onNewChat}
            className="w-full justify-start h-10 gap-2 px-3 bg-sidebar-accent/50 hover:bg-sidebar-accent hover:border-sidebar-ring/40 text-sidebar-foreground border-sidebar-border shadow-xs group font-medium cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="size-5 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground group-hover:scale-110 transition-transform">
                <SquarePen className="size-3" />
              </div>
              <span className="text-sm">New research chat</span>
            </div>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onNewChat}
                className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer"
                aria-label="New chat"
              >
                <SquarePen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New chat</TooltipContent>
          </Tooltip>
        )}
        {isOpen ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past research..."
              aria-label="Search past research"
              className="w-full h-8 pl-8 pr-3 text-xs bg-sidebar-accent/30 hover:bg-sidebar-accent/50 focus:bg-sidebar-accent/70 text-sidebar-foreground placeholder:text-muted-foreground/70 rounded-md border border-sidebar-border/50 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 transition-all"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent cursor-pointer"
                aria-label="Search chats"
              >
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Search chats</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Chat History List grouped like ChatGPT */}
      <ScrollArea className={`flex-1 py-1 ${isOpen ? "px-2" : ""}`}>
        {isOpen && sessionsLoading && (
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading research history...
          </div>
        )}
        {filteredSessions.length > 0 && (
          <div className="space-y-1 px-1">
            <p className="px-2 py-2 text-[11px] font-medium text-muted-foreground">
              Recent research
            </p>
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                className={`group flex min-w-0 items-center gap-1 rounded-md px-1 text-xs cursor-pointer ${
                  session.id === activeChatId
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground"
                }`}
                // title={
                //   session.namingStatus === "failed"
                //     ? "Name generation failed; showing the session title."
                //     : session.displayName
                // }
              >
                {editingSessionId === session.id ? (
                  <form onSubmit={saveRename} className="flex min-w-0 flex-1 items-center gap-1 py-1">
                    <Input
                      autoFocus
                      value={editingTitle}
                      maxLength={80}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingSessionId(null);
                      }}
                      aria-label="Research session name"
                      className="h-7 min-w-0 px-2 text-xs"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isSavingRename || !editingTitle.trim()}
                      aria-label="Save session name"
                    >
                      {isSavingRename ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={isSavingRename}
                      onClick={() => setEditingSessionId(null)}
                      aria-label="Cancel renaming"
                    >
                      <X className="size-3" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectChat?.(session.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left"
                      aria-current={session.id === activeChatId ? "page" : undefined}
                    >
                      {session.namingStatus === "naming" ? (
                        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-label="Generating session name" />
                      ) : session.namingStatus === "failed" ? (
                        <AlertCircle
                          className="size-3.5 shrink-0 text-destructive"
                          aria-label="Session name generation failed"
                        />
                      ) : null}
                      <span className="truncate">{session.displayName}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Actions for ${session.displayName}`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => beginRename(session)}
                        >
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          className="cursor-pointer"
                          onClick={() =>
                            setSessionToDelete({
                              id: session.id,
                              displayName: session.displayName,
                            })
                          }
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {isOpen &&
          !sessionsLoading &&
          sessions.length === 0 &&
          isLogged && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Your research history will appear here.
            </p>
          )}
        {isOpen &&
          !sessionsLoading &&
          sessions.length > 0 &&
          filteredSessions.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No sessions match your search.
            </p>
          )}
      </ScrollArea>

      {/* Bottom Footer: User Profile & Settings */}
      <div
        className={`border-t border-sidebar-border/60 bg-sidebar/80 backdrop-blur-xs ${
          isOpen ? "p-3" : "flex justify-center p-2"
        }`}
      >
        {isLogged ? (
          <AccountMenu collapsed={!isOpen} />
        ) : !isLoading && isOpen ? (
          <div className="space-y-2 rounded-lg bg-sidebar-accent/40 p-3">
            <div>
              <p className="text-sm font-medium text-sidebar-foreground">
                Sign in to Research AI
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Log in to keep your research and access it again later.
              </p>
            </div>
            <Button
              render={<Link href="/login" />}
              variant="outline"
              className="w-full justify-start gap-2"
            >
              <LogIn />
              Log in
            </Button>
          </div>
        ) : !isLoading ? (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button
                render={<Link href="/login" />}
                variant="ghost"
                size="icon-sm"
                aria-label="Log in"
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <LogIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Log in</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <AlertDialog
        open={Boolean(sessionToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setSessionToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete research session?</AlertDialogTitle>
            <AlertDialogDescription>
              “{sessionToDelete?.displayName}” and its saved messages and plans
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void confirmDelete()}
            >
              {isDeleting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              Delete permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
