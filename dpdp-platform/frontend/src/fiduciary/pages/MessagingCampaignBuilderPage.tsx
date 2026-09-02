import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { MarkdownMessageEditor } from "../components/messaging/MarkdownMessageEditor";
import { AudienceBuilder, type AudienceFilter, type AudiencePreview } from "../components/messaging/AudienceBuilder";
import type { Notice } from "../components/notices/types";
import { missingBreachPlaceholders, missingPlaceholdersKey } from "../lib/breach-notification-elements";

export type CampaignCategory = "NOTICE" | "CONSENT_REQUEST" | "COMPLIANCE_NOTICE" | "BREACH_NOTICE" | "REQUEST_UPDATE" | "PRE_ERASURE_NOTICE" | "GENERAL_NOTIFICATION" | "MARKETING";
export interface CampaignDraft { name: string; category: CampaignCategory; subject: string; bodyMarkdown: string; purposeId: string; noticeId: string; breachId: string; audienceFilter: AudienceFilter; }
export interface CampaignTemplate { id: string; code: string; name: string; category: string; subject: string; bodyMarkdown: string; }
export function marketingSubmissionBlocked(category: string, purposeId: string): boolean { return category === "MARKETING" && !purposeId.trim(); }
export function consentRequestSubmissionBlocked(category: string, purposeId: string, noticeId: string): boolean { return category === "CONSENT_REQUEST" && (!purposeId.trim() || !noticeId.trim()); }
export function campaignConfirmationText(total: number): string { return `You are about to contact exactly ${total} people, matching the previewed count.`; }
/** Mirrors CreateCampaignDto: noticeId is submitted and the server freezes its published noticeVersionId. */
export function buildCampaignPayload(draft: CampaignDraft): Record<string, unknown> { const payload: Record<string, unknown> = { name: draft.name, category: draft.category, subject: draft.subject, bodyMarkdown: draft.bodyMarkdown }; if (draft.category !== "BREACH_NOTICE") payload.audienceFilter = draft.audienceFilter; if (draft.category === "MARKETING" || draft.category === "CONSENT_REQUEST") payload.purposeId = draft.purposeId; if (draft.category === "CONSENT_REQUEST") payload.noticeId = draft.noticeId; if (draft.category === "BREACH_NOTICE") payload.breachId = draft.breachId; return payload; }
const CATEGORIES: CampaignCategory[] = ["MARKETING", "CONSENT_REQUEST", "GENERAL_NOTIFICATION", "COMPLIANCE_NOTICE", "NOTICE", "REQUEST_UPDATE", "PRE_ERASURE_NOTICE", "BREACH_NOTICE"];

/**
 * Which BREACH_NOTICE-category template a fresh campaign should pre-fill
 * from, given every template of that category available to this org.
 * Prefers the spec-named seed (`BREACH_NOTIFICATION`) so the common,
 * single-template case behaves exactly like binding to a fixed template
 * would -- but does not hard-code its id/code beyond that preference, so
 * an org that has authored an additional BREACH_NOTICE variant (a
 * translation, a severity-specific version) is not shut out. Returns
 * `undefined` when the org has no BREACH_NOTICE template at all (nothing
 * to pre-fill from; the operator still has the free-text editor as a
 * fallback, gated by the same missing-placeholder check either way).
 */
export function pickDefaultBreachTemplate(
  templates: readonly CampaignTemplate[],
): CampaignTemplate | undefined {
  return templates.find((template) => template.code === "BREACH_NOTIFICATION") ?? templates[0];
}

export function MessagingCampaignBuilderPage() {
  const navigate = useNavigate(); const [name, setName] = useState(""); const [category, setCategory] = useState<CampaignCategory>("MARKETING"); const [purposeId, setPurposeId] = useState(""); const [noticeId, setNoticeId] = useState(""); const [breachId, setBreachId] = useState(""); const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({ op: "AND", rules: [] }); const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const notices = useQuery({ queryKey: ["notices", "published-for-campaign"], queryFn: () => employeeApiClient.get<Notice[]>("/notices"), enabled: category === "CONSENT_REQUEST" }); const publishedNotices = (notices.data ?? []).filter((notice) => notice.status === "PUBLISHED" && notice.currentVersionId);
  const templates = useQuery({ queryKey: ["templates", "for-campaign-builder"], queryFn: () => employeeApiClient.get<CampaignTemplate[]>("/templates"), enabled: category === "BREACH_NOTICE" });
  const breachNoticeTemplates = (templates.data ?? []).filter((template) => template.category === "BREACH_NOTICE");

  // Spec step 23 ("review the PRE-FILLED notice") means a BREACH_NOTICE
  // draft starts from the org's breach template, not a blank editor --
  // authoring one from scratch is what let a defective, blank-elements
  // notice out the door with no template involved at all. Loads once per
  // BREACH_NOTICE selection; picking a different template from the
  // dropdown below re-loads explicitly.
  useEffect(() => {
    if (category !== "BREACH_NOTICE" || selectedTemplateId) return;
    const preferred = pickDefaultBreachTemplate(breachNoticeTemplates);
    if (!preferred) return;
    setSelectedTemplateId(preferred.id);
    setSubject(preferred.subject);
    setBody(preferred.bodyMarkdown);
    setAcknowledgedKey(null);
  }, [category, breachNoticeTemplates, selectedTemplateId]);

  function loadTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    setAcknowledgedKey(null);
    const template = breachNoticeTemplates.find((entry) => entry.id === templateId);
    if (template) { setSubject(template.subject); setBody(template.bodyMarkdown); }
  }

  // Applies to whatever body is about to be saved for a BREACH_NOTICE
  // campaign, whether it came from the template above untouched or was
  // edited afterwards -- the same `missingBreachPlaceholders` check
  // `MessagingTemplateEditorPage` uses, not a second, subtly different
  // copy of it, so an operator meets the identical safeguard on both
  // screens. `acknowledgedKey` mirrors that page's keyed-acknowledgement
  // pattern too: ticking the box only covers the exact missing set it was
  // ticked for, so editing the body again to drop a further, DIFFERENT
  // element re-arms the gate rather than riding on the earlier tick.
  const missingBreachElements = category === "BREACH_NOTICE" ? missingBreachPlaceholders(subject, body) : [];
  const missingBreachElementsKey = missingPlaceholdersKey(missingBreachElements);
  const breachElementsAcknowledged = missingBreachElements.length === 0 || acknowledgedKey === missingBreachElementsKey;

  const draft = { name, category, subject, bodyMarkdown: body, purposeId, noticeId, breachId, audienceFilter };
  const save = useMutation({ mutationFn: () => employeeApiClient.post<{ id: string }>("/campaigns", buildCampaignPayload(draft)), onSuccess: () => { toast.success("Campaign draft saved"); navigate("/app/messaging/campaigns"); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save campaign") });
  const invalid = !name.trim() || !subject.trim() || !body.trim() || marketingSubmissionBlocked(category, purposeId) || consentRequestSubmissionBlocked(category, purposeId, noticeId) || (category === "BREACH_NOTICE" && !breachId.trim()) || (category === "BREACH_NOTICE" && !breachElementsAcknowledged); const purposeNeeded = category === "MARKETING" || category === "CONSENT_REQUEST";
  return <div className="space-y-6"><div><h1 className="text-xl font-semibold">New campaign</h1><p className="text-sm text-muted-foreground">The preview is the send set; changing content or filters requires a new preview.</p></div><Card><CardHeader><CardTitle>Message</CardTitle></CardHeader><CardContent className="space-y-4"><label className="space-y-1 text-sm">Campaign name<input className="flex h-9 w-full rounded-md border px-3" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="space-y-1 text-sm">Category<select aria-label="Campaign category" className="flex h-9 w-full rounded-md border px-3" value={category} onChange={(e) => { setCategory(e.target.value as CampaignCategory); setPreview(null); setSelectedTemplateId(""); setAcknowledgedKey(null); }}>{CATEGORIES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>{purposeNeeded ? <label className="space-y-1 text-sm">Purpose ID (required for {category})<input aria-label="Purpose ID" className="flex h-9 w-full rounded-md border px-3" value={purposeId} onChange={(e) => setPurposeId(e.target.value)} required /></label> : null}{category === "CONSENT_REQUEST" ? <label className="space-y-1 text-sm">Published notice (required)<select aria-label="Published notice" className="flex h-9 w-full rounded-md border bg-background px-3" value={noticeId} onChange={(e) => setNoticeId(e.target.value)} required><option value="">Choose a published notice</option>{publishedNotices.map((notice) => <option key={notice.id} value={notice.id}>{notice.name} ({notice.code}) · published version {notice.currentVersionId}</option>)}</select><span className="block text-xs text-muted-foreground">Saving links this request to the selected published notice and freezes that notice version.</span></label> : null}{category === "BREACH_NOTICE" ? <label className="space-y-1 text-sm">Breach ID (required)<input aria-label="Breach ID" className="flex h-9 w-full rounded-md border px-3" value={breachId} onChange={(e) => setBreachId(e.target.value)} required /></label> : null}{category === "BREACH_NOTICE" ? <label className="space-y-1 text-sm">Notice template<select aria-label="Notice template" className="flex h-9 w-full rounded-md border bg-background px-3" value={selectedTemplateId} onChange={(e) => loadTemplate(e.target.value)}><option value="">Start blank (not recommended)</option>{breachNoticeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.code})</option>)}</select><span className="block text-xs text-muted-foreground">Loads the template's subject and body below for review -- edit freely, but every Rule 7(1) placeholder must stay present or be acknowledged.</span></label> : null}<MarkdownMessageEditor subject={subject} body={body} onSubjectChange={setSubject} onBodyChange={setBody} />{category === "BREACH_NOTICE" && missingBreachElements.length > 0 ? <div role="alert" className="border-2 border-destructive bg-destructive/10 p-4 font-semibold text-destructive">Warning: this breach notice is missing {missingBreachElements.length} of 6 mandatory Rule 7(1) placeholder(s) ({missingBreachElements.map((m) => m.label).join(", ")}). Affected principals will not see this information. Tick the acknowledgement to record that omission before saving.<label className="mt-3 flex gap-2 font-normal"><input type="checkbox" checked={acknowledgedKey === missingBreachElementsKey} onChange={(e) => setAcknowledgedKey(e.target.checked ? missingBreachElementsKey : null)} />I acknowledge this notice omits mandatory Rule 7(1) placeholder(s) and authorise saving it anyway.</label></div> : null}</CardContent></Card>{category !== "BREACH_NOTICE" ? <AudienceBuilder onChange={(filter) => { setAudienceFilter(filter); setPreview(null); }} onPreview={(result, filter) => { setPreview(result); setAudienceFilter(filter); }} /> : <Card><CardContent className="p-6 text-sm text-muted-foreground">Breach recipients come only from the linked breach; no audience filter is accepted.</CardContent></Card>}{(preview || category === "BREACH_NOTICE") ? <Card><CardContent className="space-y-3 p-6"><p className="font-semibold">Send confirmation</p>{preview ? <p>{campaignConfirmationText(preview.total)}</p> : <p>Recipient count will be taken from the linked breach.</p>}<Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>{save.isPending ? "Saving…" : "Save campaign draft"}</Button>{invalid && purposeNeeded && !purposeId.trim() ? <p role="alert" className="text-sm text-destructive">A {category} campaign cannot be submitted without a purpose.</p> : null}{invalid && category === "CONSENT_REQUEST" && !noticeId.trim() ? <p role="alert" className="text-sm text-destructive">A CONSENT_REQUEST campaign must link to a published notice.</p> : null}</CardContent></Card> : null}</div>;
}
