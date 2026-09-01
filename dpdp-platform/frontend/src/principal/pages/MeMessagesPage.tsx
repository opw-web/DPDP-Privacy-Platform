import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pin } from "lucide-react";
import { principalApiClient } from "../../lib/api-client";
import { listNotifications, type NotificationDto } from "../../lib/mvp2-api";
import { DateTime } from "../../components/shared/DateTime";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PortalPageHeader } from "../components/PortalPageHeader";

type MeMessage = NotificationDto;

function messageKind(message: MeMessage): "breach" | "pre-erasure" | "normal" {
  const category = `${message.title} ${message.linkPath ?? ""}`.toUpperCase();
  if (category.includes("BREACH")) return "breach";
  if (category.includes("PRE_ERASURE") || category.includes("ERASURE")) return "pre-erasure";
  return "normal";
}

/** `/me/messages` -- important legal notices remain pinned at the top of the inbox. */
export function MeMessagesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(principalApiClient),
  });
  const ordered = [...(data?.items ?? [])].sort((left, right) => {
    const priority = (message: MeMessage) => messageKind(message) === "breach" ? 0 : messageKind(message) === "pre-erasure" ? 1 : 2;
    return priority(left) - priority(right) || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      <PortalPageHeader title="Messages">
        Messages from this organization about your data and your requests.
      </PortalPageHeader>
      {isLoading ? <><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></> : !ordered.length ? <EmptyState title="No messages yet" description="Important messages from this organization will appear here." action={{ label: "Back to your portal", to: "/me" }} /> : <div className="space-y-4">
        {ordered.map((message) => {
          const kind = messageKind(message);
          const breach = kind === "breach";
          const preErasure = kind === "pre-erasure";
          return <Card key={message.id} className={breach ? "border-red-500" : preErasure ? "border-amber-500" : undefined}>
            <CardHeader className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-lg">{message.title}</CardTitle>{breach ? <Badge className="bg-red-600 text-white hover:bg-red-600"><AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Breach alert</Badge> : preErasure ? <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500"><Pin className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Erasure notice</Badge> : null}</div>{(breach || preErasure) ? <p className={breach ? "flex items-center gap-1 text-sm font-medium text-red-700" : "flex items-center gap-1 text-sm font-medium text-amber-800"}><Pin className="h-4 w-4" aria-hidden="true" />Pinned important notice</p> : null}</CardHeader>
            <CardContent className="space-y-3"><p className="whitespace-pre-wrap leading-6">{message.body}</p>{preErasure ? <div className="rounded-md bg-amber-50 p-4 text-amber-950"><p className="font-medium">You can stop this erasure in any of these three ways:</p><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Log in to your account.</li><li>Contact us about the purpose your data was collected for.</li><li>Exercise your rights, such as making a request in this portal.</li></ol></div> : null}<p className="text-sm text-muted-foreground">Sent <DateTime value={message.createdAt} /></p></CardContent>
          </Card>;
        })}
      </div>}
    </div>
  );
}
