import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileArchive,
  FileText,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { humanizeEnum } from "../lib/enum-options";

export interface PrincipalEvidenceConsentEvent {
  purposeId: string;
  purposeCode: string | null;
  purposeName: string | null;
  fromStatus: string | null;
  toStatus: string;
  channel: string;
  noticeVersionId: string | null;
  noticeContentHash: string | null;
  actorType: string;
  actorLabel: string;
  createdAt: string;
}

export interface PrincipalEvidenceNoticeVersion {
  noticeVersionId: string;
  noticeCode: string | null;
  noticeName: string | null;
  version: number | null;
  contentHash: string | null;
  publishedAt: string | null;
}

export interface PrincipalEvidenceRequestEvent {
  fromStatus: string | null;
  toStatus: string | null;
  actorType: string;
  actorLabel: string;
  note: string | null;
  visibleToPrincipal: boolean;
  createdAt: string;
}

export interface PrincipalEvidenceRequest {
  id: string;
  reference: string;
  type: string;
  status: string;
  submittedAt: string;
  dueAt: string | null;
  completedAt: string | null;
  outcomeCode: string | null;
  outcome: string | null;
  rejectionReason: string | null;
  events: PrincipalEvidenceRequestEvent[];
}

export interface PrincipalEvidenceMessage {
  campaignReference: string;
  campaignName: string;
  category: string;
  channel: string;
  status: string;
  suppressReason: string | null;
  renderedSubject: string | null;
  sentAt: string | null;
}

export interface PrincipalEvidenceBreachInclusion {
  breachReference: string;
  breachTitle: string;
  breachStatus: string;
  becameAwareAt: string;
  notifiedAt: string | null;
  notificationChannel: string | null;
}

export interface PrincipalEvidenceFile {
  principal: {
    id: string;
    reference: string;
    displayName: string | null;
    ageStatus: string;
  };
  organizationName: string;
  generatedAt: string;
  consentEvents: PrincipalEvidenceConsentEvent[];
  noticeVersionsShown: PrincipalEvidenceNoticeVersion[];
  requests: PrincipalEvidenceRequest[];
  messagesReceived: PrincipalEvidenceMessage[];
  breachInclusions: PrincipalEvidenceBreachInclusion[];
  governmentRequests: Array<Record<string, unknown>>;
  suppressedRequestCount: number;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function DownloadButton({
  path,
  filename,
  label,
  icon: Icon,
}: {
  path: string;
  filename: string;
  label: string;
  icon: LucideIcon;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  async function download() {
    setIsDownloading(true);
    try {
      const blob = await employeeApiClient.getBlob(path);
      saveBlob(blob, filename);
      toast.success(`${label} downloaded.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to export this evidence.");
      } else {
        toast.error(`Could not download ${label.toLowerCase()}. Please try again.`);
      }
    } finally {
      setIsDownloading(false);
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      disabled={isDownloading}
      onClick={() => {
        void download();
      }}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {isDownloading ? "Downloading…" : label}
    </Button>
  );
}

function EvidenceCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyEvidence({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

export function PrincipalEvidencePage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["principal-evidence", id],
    queryFn: () => employeeApiClient.get<PrincipalEvidenceFile>(`/principals/${id}/evidence`),
    enabled: id.length > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="principal-evidence-skeleton">
        <Skeleton className="h-8 w-72" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={Shield}
        title="Evidence file unavailable"
        description="This principal evidence file could not be loaded. Check the principal reference and your access permission."
        action={{ label: "Back to principals", to: "/app/principals" }}
      />
    );
  }

  const { principal } = data;
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5" asChild>
        <Link to={`/app/principals/${principal.id}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to principal
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">
              Evidence file: {principal.displayName ?? principal.reference}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{principal.reference}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              EV-03 records the person's consent events, notices shown, rights requests, messages,
              and breach inclusions. It supports an audit trail; it is not a conclusion about the
              organization's legal position.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{humanizeEnum(principal.ageStatus)}</Badge>
            <span className="text-xs text-muted-foreground">
              Generated <DateTime value={data.generatedAt} />
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          <PermissionGate permission="CAN_VIEW_ALL_PERSONAL_DATA">
            <DownloadButton
              path={`/principals/${principal.id}/evidence.pdf`}
              filename={`evidence-${principal.reference}.pdf`}
              label="Download evidence PDF"
              icon={FileText}
            />
          </PermissionGate>
          <PermissionGate permission="CAN_EXPORT_EVIDENCE">
            <DownloadButton
              path="/evidence/pack.zip"
              filename="evidence-pack.zip"
              label="Download evidence pack (ZIP)"
              icon={FileArchive}
            />
          </PermissionGate>
        </CardContent>
      </Card>

      <EvidenceCard
        title="Consent events"
        description="Every recorded consent change for this principal, including the notice version reference and actor."
      >
        {data.consentEvents.length === 0 ? (
          <EmptyEvidence text="No consent events are recorded for this principal." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Channel / actor</TableHead>
                <TableHead>Notice version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.consentEvents.map((event, index) => (
                <TableRow key={`${event.purposeId}-${event.createdAt}-${index}`}>
                  <TableCell><DateTime value={event.createdAt} /></TableCell>
                  <TableCell>{event.purposeName ?? event.purposeCode ?? event.purposeId}</TableCell>
                  <TableCell>
                    {event.fromStatus ? `${humanizeEnum(event.fromStatus)} → ` : ""}
                    {humanizeEnum(event.toStatus)}
                  </TableCell>
                  <TableCell>{humanizeEnum(event.channel)} · {event.actorLabel}</TableCell>
                  <TableCell className="font-mono text-xs">{event.noticeVersionId ?? "Not recorded"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EvidenceCard>

      <EvidenceCard
        title="Notice versions shown"
        description="Distinct notice versions referenced by the recorded consent trail, with content hashes where available."
      >
        {data.noticeVersionsShown.length === 0 ? (
          <EmptyEvidence text="No notice version references are recorded." />
        ) : (
          <div className="space-y-3">
            {data.noticeVersionsShown.map((notice) => (
              <div key={notice.noticeVersionId} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{notice.noticeName ?? notice.noticeCode ?? notice.noticeVersionId}</span>
                  <Badge variant="secondary">Version {notice.version ?? "unknown"}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{notice.noticeVersionId}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">Content hash: {notice.contentHash ?? "Not recorded"}</p>
                {notice.publishedAt ? <p className="mt-1 text-xs text-muted-foreground">Published <DateTime value={notice.publishedAt} /></p> : null}
              </div>
            ))}
          </div>
        )}
      </EvidenceCard>

      <EvidenceCard
        title="Rights requests"
        description="Requests, their stored deadlines and outcomes, plus the request-event trail."
      >
        {data.requests.length === 0 ? (
          <EmptyEvidence text="No rights requests are recorded for this principal." />
        ) : (
          <div className="space-y-4">
            {data.requests.map((request) => (
              <div key={request.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{request.reference} · {humanizeEnum(request.type)}</span>
                  <Badge variant={request.status === "COMPLETED" ? "success" : "secondary"}>{humanizeEnum(request.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Submitted <DateTime value={request.submittedAt} />{request.dueAt ? <> · Due <DateTime value={request.dueAt} /></> : null}</p>
                {request.outcome ? <p className="mt-2 text-sm">Outcome: {request.outcome}</p> : null}
                {request.rejectionReason ? <p className="mt-2 text-sm">Reason: {request.rejectionReason}</p> : null}
                {request.events.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-l pl-3 text-xs text-muted-foreground">
                    {request.events.map((event, index) => (
                      <li key={`${event.createdAt}-${index}`}>
                        <DateTime value={event.createdAt} /> · {event.fromStatus ? `${humanizeEnum(event.fromStatus)} → ` : ""}{event.toStatus ? humanizeEnum(event.toStatus) : "Note"} · {event.actorLabel}
                        {event.note ? ` — ${event.note}` : ""}
                        {event.visibleToPrincipal ? <Badge className="ml-2" variant="outline">Visible to principal</Badge> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </EvidenceCard>

      <EvidenceCard
        title="Messages received"
        description="Campaign delivery records addressed to this principal, including suppressed delivery reasons."
      >
        {data.messagesReceived.length === 0 ? (
          <EmptyEvidence text="No message delivery records are recorded for this principal." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Category / channel</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.messagesReceived.map((message, index) => (
                <TableRow key={`${message.campaignReference}-${index}`}>
                  <TableCell><span className="font-medium">{message.campaignName}</span><span className="block font-mono text-xs text-muted-foreground">{message.campaignReference}</span>{message.renderedSubject ? <span className="block text-xs text-muted-foreground">{message.renderedSubject}</span> : null}</TableCell>
                  <TableCell>{humanizeEnum(message.category)} · {humanizeEnum(message.channel)}</TableCell>
                  <TableCell><Badge variant={message.status === "SENT" ? "success" : "secondary"}>{humanizeEnum(message.status)}</Badge>{message.suppressReason ? <span className="mt-1 block text-xs text-muted-foreground">{message.suppressReason}</span> : null}</TableCell>
                  <TableCell>{message.sentAt ? <DateTime value={message.sentAt} /> : "Not sent"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EvidenceCard>

      <EvidenceCard
        title="Breach inclusions"
        description="Breaches whose affected-principal register includes this person, with notification evidence."
      >
        {data.breachInclusions.length === 0 ? (
          <EmptyEvidence text="No breach inclusion records are recorded for this principal." />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Breach</TableHead><TableHead>Status</TableHead><TableHead>Awareness time</TableHead><TableHead>Principal notification</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.breachInclusions.map((breach) => (
                <TableRow key={breach.breachReference}>
                  <TableCell><span className="font-medium">{breach.breachTitle}</span><span className="block font-mono text-xs text-muted-foreground">{breach.breachReference}</span></TableCell>
                  <TableCell><Badge variant="secondary">{humanizeEnum(breach.breachStatus)}</Badge></TableCell>
                  <TableCell><DateTime value={breach.becameAwareAt} /></TableCell>
                  <TableCell>{breach.notifiedAt ? <><DateTime value={breach.notifiedAt} />{breach.notificationChannel ? ` · ${humanizeEnum(breach.notificationChannel)}` : ""}</> : "Not recorded"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EvidenceCard>

      <EvidenceCard
        title="Government requests"
        description="Requests visible under the non-disclosure rules. Suppressed records are counted but their details are not shown here."
      >
        <p className="text-sm">{data.governmentRequests.length} visible request(s); {data.suppressedRequestCount} suppressed request(s).</p>
      </EvidenceCard>
    </div>
  );
}
