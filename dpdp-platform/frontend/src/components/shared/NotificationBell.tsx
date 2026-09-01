import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import type { ApiClient } from "../../lib/api-client";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationDto,
} from "../../lib/mvp2-api";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

export interface NotificationBellProps {
  /**
   * Either `employeeApiClient` or `principalApiClient` (`lib/api-client.ts`).
   * `GET /api/notifications` (spec line 886) accepts either an employee or
   * a principal bearer token and returns only that actor's own rows, so
   * this ONE component mounts in both `AppShell` and `PortalShell` --
   * injected, rather than importing a client directly, since it does not
   * belong to either realm exclusively.
   */
  apiClient: ApiClient;
  className?: string;
}

const POLL_INTERVAL_MS = 20_000;

/**
 * Spec line 901: polls `GET /api/notifications` via TanStack Query
 * `refetchInterval: 20_000` plus `refetchOnWindowFocus` -- no WebSocket.
 * The bell icon always shows the unread count; the panel lists recent
 * notifications and lets the actor mark one (or all) read. Read state is
 * tracked server-side (`NotificationDto.readAt`); this component never
 * fabricates local read state.
 */
export function NotificationBell({ apiClient, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(apiClient),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(apiClient, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(apiClient),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] leading-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        ) : null}
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-card p-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-medium">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllReadMutation.mutate()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (item.readAt === null) markReadMutation.mutate(item.id);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationDto;
  onOpen: () => void;
}) {
  const body = (
    <div
      className={cn(
        "rounded-md px-2 py-2 text-sm hover:bg-accent",
        item.readAt === null && "bg-accent/50 font-medium",
      )}
    >
      <p>{item.title}</p>
      <p className="text-xs font-normal text-muted-foreground">{item.body}</p>
    </div>
  );

  if (item.linkPath) {
    return (
      <li>
        <Link to={item.linkPath} onClick={onOpen}>
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button type="button" className="w-full text-left" onClick={onOpen}>
        {body}
      </button>
    </li>
  );
}
