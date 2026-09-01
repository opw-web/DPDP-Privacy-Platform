import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { principalApiClient } from "../../lib/api-client";
import { DateTime } from "../../components/shared/DateTime";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { PortalPageHeader } from "../components/PortalPageHeader";

interface RequestEvent {
  id: string;
  createdAt: string;
  note?: string | null;
  actorLabel?: string | null;
  status?: string | null;
  toStatus?: string | null;
  visibleToPrincipal?: boolean;
}

interface MeRequestDetail {
  reference: string;
  type: string;
  status: string;
  subject: string;
  body: string;
  submittedAt: string;
  dueAt?: string | null;
  outcome?: string | null;
  events?: RequestEvent[];
  timeline?: RequestEvent[];
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

/** `/me/requests/:ref` -- progress, messages, comment and cancellation for one request. */
export function MeRequestDetailPage() {
  const { ref = "" } = useParams();
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();
  const { data: request, isLoading, isError } = useQuery({
    queryKey: ["me", "requests", ref],
    queryFn: () => principalApiClient.get<MeRequestDetail>(`/me/requests/${ref}`),
    enabled: Boolean(ref),
    refetchInterval: 20_000,
  });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["me", "requests"] }),
    queryClient.invalidateQueries({ queryKey: ["me", "requests", ref] }),
  ]);
  const cancel = useMutation({
    mutationFn: () => principalApiClient.post(`/me/requests/${ref}/cancel`),
    onSuccess: () => void refresh(),
  });
  const addComment = useMutation({
    mutationFn: () => principalApiClient.post(`/me/requests/${ref}/comment`, { comment }),
    onSuccess: () => { setComment(""); void refresh(); },
  });
  const events = request?.timeline ?? request?.events ?? [];

  return (
    <div className="space-y-6">
      <PortalPageHeader title="Request details">
        Follow the progress of your request and send a message to the team working on it.
      </PortalPageHeader>
      <Link to="/me/requests" className="text-sm text-primary underline underline-offset-4">Back to all requests</Link>

      {isLoading ? <><Skeleton className="h-40 w-full" /><Skeleton className="h-56 w-full" /></> : isError || !request ? <Card><CardContent className="p-6"><h2 className="font-semibold">We could not find this request</h2><p className="mt-1 text-muted-foreground">It may no longer be available. Please return to your requests and try again.</p></CardContent></Card> : <>
        <Card>
          <CardHeader className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-xl">{request.subject}</CardTitle><Badge variant="outline">{request.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-muted-foreground">Reference: {request.reference}</p></CardHeader>
          <CardContent className="space-y-3"><p className="whitespace-pre-wrap">{request.body}</p><p className="text-sm text-muted-foreground">Sent <DateTime value={request.submittedAt} />.</p>{request.dueAt ? <p className="font-medium">The company aims to respond by <DateTime value={request.dueAt} />.</p> : <p className="font-medium">The company has not published a response date for this kind of request.</p>}{request.outcome ? <div className="rounded-md bg-muted p-3"><p className="font-medium">Outcome</p><p>{request.outcome}</p></div> : null}</CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-xl">Updates and messages</CardTitle></CardHeader>
          <CardContent>{events.length ? <ol className="space-y-4 border-l pl-5">{events.filter((event) => event.visibleToPrincipal !== false).map((event) => <li key={event.id} className="relative"><span className="absolute -left-[1.7rem] top-1 h-3 w-3 rounded-full bg-primary" /><p className="font-medium">{event.note ?? (event.toStatus ? `Status changed to ${event.toStatus.replaceAll("_", " ")}` : "Update")}</p><p className="text-sm text-muted-foreground">{event.actorLabel ? `${event.actorLabel} · ` : ""}<DateTime value={event.createdAt} /></p></li>)}</ol> : <p className="text-muted-foreground">There are no visible updates yet.</p>}</CardContent>
        </Card>

        {!TERMINAL_STATUSES.has(request.status) ? <Card>
          <CardHeader><CardTitle className="text-xl">Contact us about this request</CardTitle></CardHeader>
          <CardContent className="space-y-3"><Textarea aria-label="Add a comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment or extra details" />{addComment.isError ? <p role="alert" className="text-sm text-destructive">We could not send your comment. Please try again.</p> : null}<div className="flex flex-wrap gap-2"><Button disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>Add comment</Button><Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel request</Button></div>{cancel.isError ? <p role="alert" className="text-sm text-destructive">We could not cancel your request. Please try again.</p> : null}</CardContent>
        </Card> : null}
      </>}
    </div>
  );
}
