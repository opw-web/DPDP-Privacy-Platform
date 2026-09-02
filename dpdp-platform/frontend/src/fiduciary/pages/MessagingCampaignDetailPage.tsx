import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { employeeApiClient } from "../../lib/api-client";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/shared/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { DateTime } from "../../components/shared/DateTime";
import { humanizeEnum } from "../lib/enum-options";
import { useEmployeeAuth } from "../../lib/auth";
import { toast } from "sonner";

export function canApproveCampaign(createdByEmployeeId: string, currentEmployeeId: string): boolean { return Boolean(currentEmployeeId) && createdByEmployeeId !== currentEmployeeId; }
export function canSendCampaign(status: string): boolean { return status === "DRAFT" || status === "APPROVED"; }
export function shouldShowCampaignApproval(status: string, createdByEmployeeId: string, currentEmployeeId: string): boolean {
  return status === "PENDING_APPROVAL" && canApproveCampaign(createdByEmployeeId, currentEmployeeId);
}
export function campaignNoticeLinkText(category: string, noticeVersionId: string | null): string | null { return category === "CONSENT_REQUEST" && noticeVersionId ? `Published notice version: ${noticeVersionId}` : null; }
interface Campaign { id: string; name: string; category: string; status: string; recipientCount: number; purposeId: string | null; noticeVersionId: string | null; createdByEmployeeId: string; approvedByEmployeeId: string | null; }

/**
 * `GET /campaigns/:id/recipients`'s public shape
 * (`CAMPAIGN_RECIPIENT_PUBLIC_SELECT` in `campaigns.service.ts`) --
 * `status` is one of `DeliveryStatus` (`PENDING | DELIVERED | FAILED |
 * SUPPRESSED`), never the campaign-level `SENT`.
 */
export interface CampaignRecipient {
  id: string;
  dataPrincipalId: string;
  channel: string;
  address: string | null;
  status: string;
  suppressReason: string | null;
  failureReason: string | null;
  sentAt: string | null;
}

export interface RecipientStatusCounts {
  delivered: number;
  suppressed: number;
  failed: number;
  pending: number;
  total: number;
}

/**
 * D7: the campaign-level `status` reaches `SENT` once nothing is left
 * `PENDING` -- whether or not a single recipient actually received a
 * notice (a render refusal on every recipient still drains the PENDING
 * queue into terminal `FAILED` rows). This is the count that tells "sent
 * to everyone" apart from "sent to nobody" -- computed from the same
 * per-recipient rows the table below renders, so the summary and the
 * detail can never disagree.
 */
export function summarizeRecipientStatuses(recipients: ReadonlyArray<Pick<CampaignRecipient, "status">>): RecipientStatusCounts {
  const counts: RecipientStatusCounts = { delivered: 0, suppressed: 0, failed: 0, pending: 0, total: recipients.length };
  for (const recipient of recipients) {
    if (recipient.status === "DELIVERED") counts.delivered += 1;
    else if (recipient.status === "SUPPRESSED") counts.suppressed += 1;
    else if (recipient.status === "FAILED") counts.failed += 1;
    else counts.pending += 1;
  }
  return counts;
}

/**
 * True exactly in the D7 scenario: the campaign has finished sending
 * (campaign-level status is terminal, nothing left PENDING) but not one
 * recipient was actually delivered to. A campaign in this state must not
 * read the same as a campaign that delivered -- callers use this to show
 * a distinct, impossible-to-miss banner instead of the ordinary summary.
 */
export function deliveredToNobody(campaignStatus: string, counts: RecipientStatusCounts): boolean {
  const terminal = campaignStatus === "SENT" || campaignStatus === "FAILED" || campaignStatus === "CANCELLED";
  return terminal && counts.total > 0 && counts.delivered === 0;
}

/**
 * The text the operator must see for a non-delivered recipient: the
 * renderer's `failureReason` (it names the missing Rule 7(1) element --
 * that text is the entire point of D7) for a `FAILED` row, or the
 * suppression code for a `SUPPRESSED` one (the BR-13 evidence answer to
 * "who did you not contact, and why"). `null` for every other status.
 */
export function recipientReasonText(recipient: Pick<CampaignRecipient, "status" | "failureReason" | "suppressReason">): string | null {
  if (recipient.status === "FAILED") return recipient.failureReason;
  if (recipient.status === "SUPPRESSED") return recipient.suppressReason;
  return null;
}

function statusBadgeVariant(status: string): "success" | "destructive" | "secondary" | "outline" {
  if (status === "DELIVERED") return "success";
  if (status === "FAILED") return "destructive";
  if (status === "SUPPRESSED") return "secondary";
  return "outline";
}

/** Detail/approval screen. The API remains authoritative; this makes same-employee approval visibly unavailable. */
export function MessagingCampaignDetailPage({ currentEmployeeId }: { currentEmployeeId?: string } = {}) {
  const { employee } = useEmployeeAuth();
  const { campaignId } = useParams();
  const query = useQuery({
    queryKey: ["campaign", campaignId],
    enabled: Boolean(campaignId),
    queryFn: () => employeeApiClient.get<Campaign>(`/campaigns/${campaignId}`),
  });
  const recipientsQuery = useQuery({
    queryKey: ["campaign-recipients", campaignId],
    enabled: Boolean(campaignId),
    queryFn: () => employeeApiClient.get<CampaignRecipient[]>(`/campaigns/${campaignId}/recipients`),
  });
  const campaign = query.data;
  const actorId = currentEmployeeId ?? employee?.id ?? "";
  const approve = useMutation({
    mutationFn: () => employeeApiClient.post(`/campaigns/${campaignId}/approve`),
    onSuccess: () => {
      toast.success("Campaign approved.");
      void query.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not approve campaign."),
  });
  const send = useMutation({
    mutationFn: () => employeeApiClient.post(`/campaigns/${campaignId}/send`),
    onSuccess: () => {
      toast.success("Campaign sent.");
      void query.refetch();
      void recipientsQuery.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send campaign."),
  });
  if (!campaign) return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  const own = !canApproveCampaign(campaign.createdByEmployeeId, actorId);
  const approvalRequired = campaign.status === "PENDING_APPROVAL";
  const canSend = canSendCampaign(campaign.status);
  const canApprove = shouldShowCampaignApproval(campaign.status, campaign.createdByEmployeeId, actorId);
  const noticeLink = campaignNoticeLinkText(campaign.category, campaign.noticeVersionId);
  const recipients = recipientsQuery.data ?? [];
  const counts = summarizeRecipientStatuses(recipients);
  const nobodyDelivered = deliveredToNobody(campaign.status, counts);
  return (
    <Card>
      <CardHeader><CardTitle>{campaign.name}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p>{campaign.category} · {campaign.status} · {campaign.recipientCount} recipients</p>
        {noticeLink ? <p className="text-sm text-muted-foreground">{noticeLink}</p> : null}
        {approvalRequired && own ? (
          <p role="alert" className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            The campaign creator cannot approve their own campaign. A different employee must approve it.
          </p>
        ) : null}
        {canApprove ? (
          <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
            {approve.isPending ? "Approving…" : "Approve campaign"}
          </Button>
        ) : null}
        {canSend ? (
          <Button onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? "Sending…" : "Send campaign"}
          </Button>
        ) : null}

        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-semibold">Delivery status</h2>
          {nobodyDelivered ? (
            <p role="alert" className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              This campaign delivered to nobody: {counts.failed} recipient(s) failed to render and{" "}
              {counts.suppressed} were suppressed, out of {counts.total}. Do not treat this as a
              completed notification -- see the reasons below.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Delivered {counts.delivered}</Badge>
            <Badge variant="destructive">Failed {counts.failed}</Badge>
            <Badge variant="secondary">Suppressed {counts.suppressed}</Badge>
            {counts.pending > 0 ? <Badge variant="outline">Pending {counts.pending}</Badge> : null}
          </div>
          {recipientsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipient records yet -- they are created once the campaign is sent.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((recipient) => {
                  const reason = recipientReasonText(recipient);
                  return (
                    <TableRow key={recipient.id}>
                      <TableCell className="font-mono text-xs">{recipient.address ?? recipient.dataPrincipalId}</TableCell>
                      <TableCell>{humanizeEnum(recipient.channel)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(recipient.status)}>{humanizeEnum(recipient.status)}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-sm">{reason ?? "—"}</TableCell>
                      <TableCell>{recipient.sentAt ? <DateTime value={recipient.sentAt} /> : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
