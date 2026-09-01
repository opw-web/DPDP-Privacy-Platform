import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ShieldCheck, UserRound } from "lucide-react";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { DateTime } from "../../components/shared/DateTime";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { GuardianConsentSelector } from "../components/children/GuardianConsentSelector";
import { ExemptionClaimForm } from "../components/children/ExemptionClaimForm";
import { GuardianForm } from "../components/children/GuardianForm";
import { guardianVerificationLabel, isGuardianConsentEligible, type GuardianRelationship } from "../components/children/types";
import type { Notice, NoticeDetail } from "../components/notices/types";

interface ExemptionClaim {
  id: string;
  purposeId: string;
  schedulePart: string;
  scheduleRow: number;
  conditionText: string;
  justification: string;
  claimedByEmployeeId: string;
  claimedAt: string;
  reviewedByEmployeeId: string | null;
  reviewedAt: string | null;
}

interface PrincipalListResponse {
  items: { id: string; displayName: string | null; reference: string; ageStatus: AgeStatus }[];
}

type AgeStatus = "UNKNOWN" | "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED";
type Purpose = { id: string; name: string; code: string; lawfulBasis: "CONSENT" | "LEGITIMATE_USE"; description: string };

const CHILD_AGE_STATUSES: readonly AgeStatus[] = ["CHILD", "GUARDIAN_REPRESENTED"];

function guardianRowsForChild(guardians: readonly GuardianRelationship[], childId: string): GuardianRelationship[] {
  return childId ? guardians.filter((guardian) => guardian.dataPrincipalId === childId) : [...guardians];
}

function VerificationEditor({ guardian }: { guardian: GuardianRelationship }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState(guardian.verification === "NONE" ? "" : guardian.verification);
  const [reference, setReference] = useState(guardian.verificationReference ?? "");
  const verify = useMutation({
    mutationFn: () => employeeApiClient.post(`/guardians/${guardian.id}/verify`, { verification: method, ...(reference.trim() ? { verificationReference: reference.trim() } : {}) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["children", "guardians"] }); toast.success("Guardian verification recorded."); },
    onError: (error: unknown) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not record verification."),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={`Verification method for ${guardian.guardianName}`} value={method} onChange={(e) => setMethod(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
        <option value="">Select method…</option>
        <option value="EXISTING_RELIABLE_DETAILS">Reliable details already held</option>
        <option value="SELF_PROVIDED_DETAILS">Details voluntarily provided</option>
        <option value="VIRTUAL_TOKEN">Virtual token</option>
        <option value="DIGITAL_LOCKER">Digital Locker</option>
        <option value="COURT_ORDER">Court order</option>
        <option value="DESIGNATED_AUTHORITY">Designated authority</option>
        <option value="LOCAL_LEVEL_COMMITTEE">Local Level Committee</option>
      </select>
      <Input aria-label={`Verification reference for ${guardian.guardianName}`} className="h-8 w-36 text-xs" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Evidence reference" />
      <Button size="sm" variant="outline" disabled={!method || verify.isPending} onClick={() => verify.mutate()}>{verify.isPending ? "Saving…" : "Record verification"}</Button>
    </div>
  );
}

export function ChildrenPage() {
  const [showGuardianForm, setShowGuardianForm] = useState(false);
  const [showExemptionForm, setShowExemptionForm] = useState(false);
  const [selectedChild, setSelectedChild] = useState("");
  const [selectedGuardian, setSelectedGuardian] = useState("");
  const [selectedPurpose, setSelectedPurpose] = useState("");
  const [selectedNotice, setSelectedNotice] = useState("");
  const queryClient = useQueryClient();
  const { data: unknownData, isLoading: unknownLoading } = useQuery({
    queryKey: ["children", "unknown-age-count"],
    queryFn: () => employeeApiClient.get<{ unknownCount: number }>("/principals/age-status/unknown-count"),
  });
  const { data: guardians, isLoading: guardiansLoading } = useQuery({
    queryKey: ["children", "guardians"],
    queryFn: () => employeeApiClient.get<GuardianRelationship[]>("/guardians"),
  });
  const { data: claims, isLoading: claimsLoading } = useQuery({
    queryKey: ["children", "exemptions"],
    queryFn: () => employeeApiClient.get<ExemptionClaim[]>("/child-exemptions"),
  });
  const { data: principalData } = useQuery({
    queryKey: ["children", "principals"],
    queryFn: () => employeeApiClient.get<PrincipalListResponse>("/principals?page=1"),
  });
  // The unfiltered principal page is paginated (25 rows), so it can omit a
  // child whose guardian is in the relationship list. Fetch both child-like
  // statuses explicitly before pairing guardians by the canonical UUID FK.
  const { data: childPrincipalData } = useQuery({
    queryKey: ["children", "principals", "CHILD"],
    queryFn: () => employeeApiClient.get<PrincipalListResponse>("/principals?ageStatus=CHILD&page=1"),
  });
  const { data: representedPrincipalData } = useQuery({
    queryKey: ["children", "principals", "GUARDIAN_REPRESENTED"],
    queryFn: () => employeeApiClient.get<PrincipalListResponse>("/principals?ageStatus=GUARDIAN_REPRESENTED&page=1"),
  });
  const { data: purposes = [] } = useQuery({
    queryKey: ["children", "purposes"],
    queryFn: () => employeeApiClient.get<Purpose[]>("/purposes"),
  });
  const { data: notices = [], isLoading: noticesLoading, isError: noticesError } = useQuery({
    queryKey: ["children", "notices"],
    queryFn: () => employeeApiClient.get<Notice[]>("/notices"),
  });
  const selectedNoticeDetail = useQuery({
    queryKey: ["children", "notice", selectedNotice],
    enabled: Boolean(selectedNotice),
    queryFn: () => employeeApiClient.get<NoticeDetail>(`/notices/${selectedNotice}`),
  });
  const guardianRows = guardians ?? [];
  const allPrincipals = [...(principalData?.items ?? []), ...(childPrincipalData?.items ?? []), ...(representedPrincipalData?.items ?? [])];
  const principalNames = new Map(allPrincipals.map((principal) => [principal.id, principal.displayName ?? principal.reference]));
  const childPrincipals = [...new Map(allPrincipals.filter((principal) => CHILD_AGE_STATUSES.includes(principal.ageStatus)).map((principal) => [principal.id, principal])).values()];
  const consentPurposes = purposes.filter((purpose) => purpose.lawfulBasis === "CONSENT");
  const purposeNotices = notices.filter((notice) => notice.status === "PUBLISHED" && notice.purposeIds.includes(selectedPurpose));
  const selectedChildRecord = childPrincipals.find((principal) => principal.id === selectedChild);
  const childGuardians = guardianRowsForChild(guardians ?? [], selectedChild);
  const selectedGuardianRecord = childGuardians.find((guardian) => guardian.id === selectedGuardian);
  const matchingVerifiedGuardians = childGuardians.filter(isGuardianConsentEligible);
  const selectedNoticeData = selectedNoticeDetail.data;
  const selectedVersion = selectedNoticeData
    ? selectedNoticeData.versions.find((version) => version.id === selectedNoticeData.currentVersionId && version.publishedAt)
      ?? selectedNoticeData.versions.find((version) => version.publishedAt)
    : undefined;
  const canRecordChildConsent = Boolean(
    selectedChildRecord && selectedPurpose && selectedNotice && selectedGuardianRecord &&
    isGuardianConsentEligible(selectedGuardianRecord) && selectedVersion,
  );
  const recordChildConsent = useMutation({
    mutationFn: () => employeeApiClient.post(`/principals/${selectedChild}/consents/${selectedPurpose}`, {
      status: "GRANTED",
      channel: "IN_PERSON",
      noticeId: selectedNotice,
      givenByGuardianId: selectedGuardian,
    }),
    onSuccess: () => {
      toast.success("Guardian-backed child consent recorded with an evidence event.");
      void queryClient.invalidateQueries({ queryKey: ["children", "consents"] });
      setSelectedNotice("");
    },
    onError: (error) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not record child consent."),
  });
  useEffect(() => {
    if (selectedGuardian && !childGuardians.some((guardian) => guardian.id === selectedGuardian)) setSelectedGuardian("");
  }, [selectedChild, selectedGuardian, childGuardians]);
  useEffect(() => {
    if (selectedNotice && !purposeNotices.some((notice) => notice.id === selectedNotice)) setSelectedNotice("");
  }, [selectedPurpose, selectedNotice, purposeNotices]);
  const unknownCount = unknownData?.unknownCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Children and guardians</h1>
        <p className="text-sm text-muted-foreground">Manage age-status gaps, verifiable guardian relationships and Fourth Schedule exemption claims.</p>
      </div>

      <Card className="border-amber-300 bg-amber-50/60">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-full bg-amber-100 p-3"><UserRound className="h-6 w-6 text-amber-800" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Unknown age status</p>
            <p className="text-3xl font-semibold text-amber-950" aria-label="Unknown age status count">{unknownLoading ? "…" : unknownCount ?? 0}</p>
            <p className="text-sm text-amber-900">A company that cannot distinguish adults from children cannot satisfy s.9. Resolve these age-status gaps explicitly.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Guardian relationships</CardTitle><CardDescription>Verification is a separate recorded act; a new relationship is never consent-eligible.</CardDescription></div>
          <Button onClick={() => setShowGuardianForm((current) => !current)}><Plus className="h-4 w-4" aria-hidden="true" />Register guardian</Button>
        </CardHeader>
        {showGuardianForm ? <CardContent><GuardianForm onDone={() => setShowGuardianForm(false)} /></CardContent> : null}
        <CardContent className={showGuardianForm ? "pt-0" : undefined}>
          {guardiansLoading ? <Skeleton className="h-24 w-full" data-testid="guardians-skeleton" /> : guardianRows.length === 0 ? <EmptyState title="No guardians registered" description="Register a parent or lawful guardian before requesting verifiable consent." action={{ label: "Register guardian", onClick: () => setShowGuardianForm(true) }} /> : (
            <div className="space-y-4">
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Guardian</th><th className="p-3">Principal</th><th className="p-3">Relationship</th><th className="p-3">Verification</th><th className="p-3">Status</th><th className="p-3">Record verification</th></tr></thead><tbody>
                {guardianRows.map((guardian) => <tr key={guardian.id} className="border-b border-border"><td className="p-3"><span className="font-medium">{guardian.guardianName}</span><br /><span className="text-xs text-muted-foreground">{guardian.guardianEmail ?? "No email"}</span></td><td className="p-3">{principalNames.get(guardian.dataPrincipalId) ?? guardian.dataPrincipalId}</td><td className="p-3">{guardian.kind === "PARENT_OF_CHILD" ? "Parent of child" : "Lawful guardian of PWD"}</td><td className="p-3"><Badge variant={isGuardianConsentEligible(guardian) ? "success" : "amber"}>{guardianVerificationLabel(guardian.verification)}</Badge>{guardian.verificationReference ? <div className="mt-1 text-xs text-muted-foreground">Ref: {guardian.verificationReference}</div> : null}</td><td className="p-3">{guardian.active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td><td className="p-3"><VerificationEditor guardian={guardian} /></td></tr>)}
              </tbody></table></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record guardian-backed child consent</CardTitle>
          <CardDescription>
            Select a child, an active verified guardian relationship, a CONSENT purpose and the published notice version that was shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (canRecordChildConsent) recordChildConsent.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="child-consent-principal">Child or guardian-represented principal</Label>
              <Select id="child-consent-principal" value={selectedChild} onChange={(event) => { setSelectedChild(event.target.value); setSelectedGuardian(""); }} required>
                <option value="">Select a child…</option>
                {childPrincipals.map((principal) => <option key={principal.id} value={principal.id}>{principal.displayName ?? principal.reference} ({principal.ageStatus === "CHILD" ? "Child" : "Guardian represented"})</option>)}
              </Select>
              {childPrincipals.length === 0 ? <p className="text-xs text-muted-foreground">No CHILD or GUARDIAN_REPRESENTED principals are available.</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="child-consent-purpose">Consent purpose</Label>
              <Select id="child-consent-purpose" value={selectedPurpose} onChange={(event) => { setSelectedPurpose(event.target.value); setSelectedNotice(""); }} required>
                <option value="">Select a CONSENT purpose…</option>
                {consentPurposes.map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.name} ({purpose.code})</option>)}
              </Select>
              {consentPurposes.length === 0 ? <p className="text-xs text-muted-foreground">No active consent-basis purposes are available.</p> : null}
            </div>
            <div className="space-y-1.5">
              {guardiansLoading ? <p className="text-sm text-muted-foreground">Loading guardian relationships…</p> : <>
                <GuardianConsentSelector
                  guardians={guardianRows}
                  childPrincipalId={selectedChild}
                  value={selectedGuardian}
                  onChange={setSelectedGuardian}
                />
                {selectedGuardianRecord ? <p className="text-xs text-emerald-700"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Verified relationship selected for this child.</p> : null}
                {selectedChild && matchingVerifiedGuardians.length === 0 ? <p role="status" className="text-xs text-amber-700">No active verified guardian is linked to this child. Guardians for another principal cannot be used.</p> : null}
              </>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="child-consent-notice">Published notice/version shown</Label>
              <Select id="child-consent-notice" value={selectedNotice} onChange={(event) => setSelectedNotice(event.target.value)} disabled={!selectedPurpose || noticesLoading || purposeNotices.length === 0} required>
                <option value="">{noticesLoading ? "Loading published notices…" : "Select a published notice…"}</option>
                {purposeNotices.map((notice) => <option key={notice.id} value={notice.id}>{notice.name} — published version {notice.currentVersionId ?? "current"}</option>)}
              </Select>
              {noticesError ? <p className="text-xs text-amber-700">Published notices could not be loaded. An employee with notice-view permission is required to choose one.</p> : null}
              {selectedVersion ? <p className="text-xs text-muted-foreground">Frozen version {selectedVersion.version} ({selectedVersion.id}) published {new Date(selectedVersion.publishedAt ?? "").toLocaleDateString()}.</p> : selectedNotice ? <p className="text-xs text-muted-foreground">Loading the selected published version…</p> : null}
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!canRecordChildConsent || recordChildConsent.isPending}>{recordChildConsent.isPending ? "Recording…" : "Record granted guardian consent"}</Button>
              <p className="mt-2 text-xs text-muted-foreground">The employee endpoint records an IN_PERSON evidence event and sends the guardian relationship id for server-side Rule 10 validation.</p>
              {recordChildConsent.error ? <p role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{recordChildConsent.error instanceof ApiError && recordChildConsent.error.message ? recordChildConsent.error.message : "Could not record child consent."}</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Child exemption claims</CardTitle><CardDescription>Every claim cites the Fourth Schedule part and row and preserves the condition text.</CardDescription></div><Button onClick={() => setShowExemptionForm((current) => !current)}><Plus className="h-4 w-4" aria-hidden="true" />New exemption claim</Button></CardHeader>
        {showExemptionForm ? <CardContent><ExemptionClaimForm onDone={() => setShowExemptionForm(false)} /></CardContent> : null}
        <CardContent className={showExemptionForm ? "pt-0" : undefined}>
          {claimsLoading ? <Skeleton className="h-24 w-full" data-testid="exemptions-skeleton" /> : (claims ?? []).length === 0 ? <EmptyState title="No exemption claims" description="Claims must quote a Schedule condition; free-text assertions are not accepted." action={{ label: "New exemption claim", onClick: () => setShowExemptionForm(true) }} /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Purpose</th><th className="p-3">Schedule citation</th><th className="p-3">Condition text</th><th className="p-3">Claimed</th><th className="p-3">Review</th></tr></thead><tbody>{(claims ?? []).map((claim) => <tr key={claim.id} className="border-b border-border"><td className="p-3 font-mono text-xs">{claim.purposeId}</td><td className="p-3 font-medium">{claim.schedulePart}, row {claim.scheduleRow}</td><td className="max-w-md p-3 text-xs">{claim.conditionText}<div className="mt-1 text-muted-foreground">Justification: {claim.justification}</div></td><td className="p-3"><DateTime value={claim.claimedAt} /></td><td className="p-3">{claim.reviewedAt ? <Badge variant="success">Reviewed</Badge> : <Badge variant="amber">Awaiting review</Badge>}</td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>
    </div>
  );
}
