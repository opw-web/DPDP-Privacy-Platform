import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { useEmployeeAuth } from "../../lib/auth";
import { toast } from "sonner";

export function canApproveCampaign(createdByEmployeeId: string, currentEmployeeId: string): boolean { return Boolean(currentEmployeeId) && createdByEmployeeId !== currentEmployeeId; }
export function canSendCampaign(status: string): boolean { return status === "DRAFT" || status === "APPROVED"; }
export function shouldShowCampaignApproval(status: string, createdByEmployeeId: string, currentEmployeeId: string): boolean {
  return status === "PENDING_APPROVAL" && canApproveCampaign(createdByEmployeeId, currentEmployeeId);
}
export function campaignNoticeLinkText(category: string, noticeVersionId: string | null): string | null { return category === "CONSENT_REQUEST" && noticeVersionId ? `Published notice version: ${noticeVersionId}` : null; }
interface Campaign { id: string; name: string; category: string; status: string; recipientCount: number; purposeId: string | null; noticeVersionId: string | null; createdByEmployeeId: string; approvedByEmployeeId: string | null; }
/** Detail/approval screen. The API remains authoritative; this makes same-employee approval visibly unavailable. */
export function MessagingCampaignDetailPage({ currentEmployeeId }: { currentEmployeeId?: string } = {}) {
  const { employee } = useEmployeeAuth();
  const { campaignId } = useParams();
  const query = useQuery({
    queryKey: ["campaign", campaignId],
    enabled: Boolean(campaignId),
    queryFn: () => employeeApiClient.get<Campaign>(`/campaigns/${campaignId}`),
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
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send campaign."),
  });
  if (!campaign) return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  const own = !canApproveCampaign(campaign.createdByEmployeeId, actorId);
  const approvalRequired = campaign.status === "PENDING_APPROVAL";
  const canSend = canSendCampaign(campaign.status);
  const canApprove = shouldShowCampaignApproval(campaign.status, campaign.createdByEmployeeId, actorId);
  const noticeLink = campaignNoticeLinkText(campaign.category, campaign.noticeVersionId);
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
      </CardContent>
    </Card>
  );
}
