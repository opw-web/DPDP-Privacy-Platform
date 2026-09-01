import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { principalApiClient } from "../../lib/api-client";
import { DateTime } from "../../components/shared/DateTime";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { PortalPageHeader } from "../components/PortalPageHeader";

type ConsentStatus = "GRANTED" | "DENIED" | "WITHDRAWN" | "UNKNOWN";

interface ConsentHistoryItem {
  id?: string;
  toStatus?: ConsentStatus;
  status?: ConsentStatus;
  createdAt?: string;
  occurredAt?: string;
}

interface MeConsent {
  id: string;
  purposeId: string;
  status: ConsentStatus;
  grantedAt?: string | null;
  deniedAt?: string | null;
  withdrawnAt?: string | null;
  updatedAt?: string;
  noticeId?: string | null;
  noticeVersionId?: string | null;
  presentedNoticeId?: string | null;
  presentedNoticeVersionId?: string | null;
  presentedCampaignId?: string | null;
  notice?: { id?: string | null } | null;
  purpose: {
    id: string;
    name: string;
    description?: string | null;
    noticeId?: string | null;
    lawfulBasis?: string;
  };
  history?: ConsentHistoryItem[];
  events?: ConsentHistoryItem[];
}

interface LegitimateUsePurpose {
  id: string;
  name: string;
  description?: string | null;
  legitimateUse?: string | null;
  section7Limb?: string | null;
  lawfulBasis?: string;
}

type MeConsentsResponse =
  | MeConsent[]
  | {
      consents?: MeConsent[];
      consentPurposes?: MeConsent[];
      legitimateUses?: LegitimateUsePurpose[];
      legitimateUsePurposes?: LegitimateUsePurpose[];
    };

interface NoticeVersion {
  id?: string;
  title?: string;
  name?: string;
  version?: number;
  bodyMarkdown?: string;
  body?: string;
  languageCode?: string;
  fallbackToEnglish?: boolean;
}

const STATUS_COPY: Record<ConsentStatus, string> = {
  GRANTED: "Allowed",
  DENIED: "Declined",
  WITHDRAWN: "Withdrawn",
  UNKNOWN: "No choice yet",
};

function asSections(
  payload: MeConsentsResponse | undefined,
): { consents: MeConsent[]; legitimateUses: LegitimateUsePurpose[] } {
  if (!payload) return { consents: [] as MeConsent[], legitimateUses: [] as LegitimateUsePurpose[] };
  if (Array.isArray(payload)) {
    return {
      consents: payload.filter((row) => row.purpose?.lawfulBasis !== "LEGITIMATE_USE"),
      legitimateUses: payload
        .filter((row) => row.purpose?.lawfulBasis === "LEGITIMATE_USE")
        .map((row) => ({ ...row.purpose })),
    };
  }
  return {
    consents: payload.consents ?? payload.consentPurposes ?? [],
    legitimateUses: payload.legitimateUses ?? payload.legitimateUsePurposes ?? [],
  };
}

function StatusBadge({ status }: { status: ConsentStatus }) {
  const variant = status === "GRANTED" ? "default" : status === "UNKNOWN" ? "secondary" : "outline";
  return <Badge variant={variant}>{STATUS_COPY[status]}</Badge>;
}

function NoticeDialog({ noticeId, open, onOpenChange }: { noticeId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "notices", noticeId],
    queryFn: () => principalApiClient.get<NoticeVersion>(`/me/notices/${noticeId}`),
    enabled: open && Boolean(noticeId),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What you were shown{data?.version ? ` — version ${data.version}` : ""}</DialogTitle>
        </DialogHeader>
        {isLoading ? <Skeleton className="h-48 w-full" /> : noticeId ? (
          <>
            {data?.fallbackToEnglish ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">This version is not available in your selected language, so it is shown in English.</p> : null}
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{data?.bodyMarkdown ?? data?.body ?? "This notice version could not be displayed."}</pre>
          </>
        ) : <p className="text-sm text-muted-foreground">The notice reference is not available for this older record.</p>}
      </DialogContent>
    </Dialog>
  );
}

/** `/me/consents` -- choices for consent purposes, and information only for legitimate uses. */
export function MeConsentsPage() {
  const queryClient = useQueryClient();
  const [noticeId, setNoticeId] = useState<string | null>(null);
  const [withdrawal, setWithdrawal] = useState<MeConsent | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["me", "consents"],
    queryFn: () => principalApiClient.get<MeConsentsResponse>("/me/consents"),
  });
  const changeConsent = useMutation({
    mutationFn: ({ consent, status }: { consent: MeConsent; status: Exclude<ConsentStatus, "UNKNOWN"> }) => {
      const currentNoticeId = consent.noticeId ?? consent.presentedNoticeId ?? consent.notice?.id ?? consent.purpose.noticeId ?? undefined;
      return principalApiClient.post(`/me/consents/${consent.purposeId}`, {
        status,
        ...(currentNoticeId ? { noticeId: currentNoticeId } : {}),
        ...(status !== "WITHDRAWN" && consent.presentedCampaignId
          ? { evidence: { campaignId: consent.presentedCampaignId } }
          : {}),
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me", "consents"] }),
  });
  const { consents, legitimateUses } = asSections(data);

  return (
    <div className="space-y-8">
      <PortalPageHeader title="Your choices about your data">
        Choose how we may use your data for each purpose. You can change your mind at any time.
      </PortalPageHeader>

      {isLoading ? <div className="space-y-4"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div> : consents.length === 0 ? (
        <EmptyState title="No choices to make" description="There are no consent choices for your account right now." action={{ label: "Back to your portal", to: "/me" }} />
      ) : (
        <section aria-labelledby="consent-choices" className="space-y-4">
          <h2 id="consent-choices" className="text-xl font-semibold">Your consent choices</h2>
          {consents.map((consent) => {
            const shownNoticeId = consent.noticeVersionId ?? consent.presentedNoticeVersionId ?? consent.noticeId ?? consent.presentedNoticeId ?? null;
            const history = consent.history ?? consent.events ?? [];
            return <Card key={consent.id}>
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg">{consent.purpose.name}</CardTitle>
                  <StatusBadge status={consent.status} />
                </div>
                {consent.purpose.description ? <p className="text-base text-muted-foreground">{consent.purpose.description}</p> : null}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {consent.grantedAt ? <p>Allowed on <DateTime value={consent.grantedAt} />.</p> : null}
                  {consent.deniedAt ? <p>Declined on <DateTime value={consent.deniedAt} />.</p> : null}
                  {consent.withdrawnAt ? <p>Withdrawn on <DateTime value={consent.withdrawnAt} />.</p> : null}
                </div>
                {/* All three choices are direct, equal-size controls on this same screen (CN-05 / Check 9). */}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button onClick={() => changeConsent.mutate({ consent, status: "GRANTED" })} disabled={changeConsent.isPending}>
                    <Check className="h-4 w-4" aria-hidden="true" /> Allow
                  </Button>
                  <Button variant="outline" onClick={() => changeConsent.mutate({ consent, status: "DENIED" })} disabled={changeConsent.isPending}>
                    <X className="h-4 w-4" aria-hidden="true" /> Decline
                  </Button>
                  <Button variant="outline" onClick={() => setWithdrawal(consent)} disabled={changeConsent.isPending}>
                    Withdraw
                  </Button>
                </div>
                {changeConsent.isError ? <p role="alert" className="text-sm text-destructive">We could not save your choice. Please try again.</p> : null}
                <Button variant="link" className="h-auto p-0" onClick={() => setNoticeId(shownNoticeId)}>
                  What you were shown
                </Button>
                <div>
                  <h3 className="text-sm font-medium">Full history</h3>
                  {history.length ? <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {history.map((event, index) => <li key={event.id ?? `${event.createdAt ?? "event"}-${index}`}>
                      {STATUS_COPY[event.toStatus ?? event.status ?? consent.status]}{event.createdAt ?? event.occurredAt ? <> — <DateTime value={event.createdAt ?? event.occurredAt ?? ""} /></> : null}
                    </li>)}
                  </ol> : <p className="mt-1 text-sm text-muted-foreground">No earlier changes are recorded.</p>}
                </div>
              </CardContent>
            </Card>;
          })}
        </section>
      )}

      {legitimateUses.length ? <section aria-labelledby="legitimate-use" className="space-y-4">
        <div>
          <h2 id="legitimate-use" className="text-xl font-semibold">Uses allowed by law</h2>
          <p className="text-muted-foreground">These uses do not ask for a consent choice. This is information for you.</p>
        </div>
        {legitimateUses.map((purpose) => <Card key={purpose.id}>
          <CardHeader><CardTitle className="text-lg">{purpose.name}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-base">
            {purpose.description ? <p>{purpose.description}</p> : null}
            <p className="text-muted-foreground">{purpose.legitimateUse ?? purpose.section7Limb ?? "We use this only for the legal reason stated in our privacy information."}</p>
          </CardContent>
        </Card>)}
      </section> : null}

      <NoticeDialog noticeId={noticeId} open={noticeId !== null} onOpenChange={(open) => { if (!open) setNoticeId(null); }} />
      <Dialog open={withdrawal !== null} onOpenChange={(open) => { if (!open) setWithdrawal(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Withdraw your permission?</DialogTitle></DialogHeader>
          <DialogDescription>We will stop using your data for {withdrawal?.purpose.name ?? "this purpose"} right away. Things already done before today stay valid.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawal(null)}>Keep permission</Button>
            <Button variant="destructive" onClick={() => { if (withdrawal) changeConsent.mutate({ consent: withdrawal, status: "WITHDRAWN" }, { onSuccess: () => setWithdrawal(null) }); }}>Withdraw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
