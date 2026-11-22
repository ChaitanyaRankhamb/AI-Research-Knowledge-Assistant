"use client";

import { LogOut } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { ThemeToggle } from "@/src/lib/theme-toggle";
import { useUser } from "@/context/UserContext";
import { toast } from "sonner";

interface AccountMenuProps {
  collapsed?: boolean;
}

export function AccountMenu({ collapsed = false }: AccountMenuProps) {
  const { user, logout } = useUser();

  if (!user) return null;

  const initial = user.username.trim().charAt(0).toUpperCase() || "U";

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not log out from the server.",
      );
    }
  };

  return (
    <Popover>
      <PopoverTrigger
        className={`flex min-w-0 items-center rounded-lg text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          collapsed
            ? "justify-center p-1.5"
            : "w-full justify-between gap-2.5 p-1.5"
        }`}
        aria-label={`Account menu for ${user.username}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" className="shrink-0 ring-1 ring-border">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
            <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <span className="truncate text-xs font-medium text-sidebar-foreground">
              {user.username}
            </span>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={collapsed ? "center" : "start"}
        className="w-72 gap-0 p-0"
      >
        <div className="flex items-center gap-3 p-4">
          <Avatar className="size-10 shrink-0">
            {user.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
            <AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.username}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="border-t border-border p-2">
          <div className="flex items-center justify-between rounded-md px-2 py-1">
            <span className="text-sm">Theme</span>
            <ThemeToggle />
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void handleLogout()}
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <LogOut />
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
