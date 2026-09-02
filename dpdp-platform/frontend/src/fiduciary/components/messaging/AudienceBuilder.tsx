import { useState } from "react";
import { employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

export interface AudiencePreview { total: number; withEmail: number; portalOnly: number; suppressedByConsent: number; suppressedAsChild: number; sample: string[]; }
export type AudienceField = "consent" | "hasEmail" | "country" | "city" | "ageStatus" | "lastContactAt";
export interface AudienceRule { field: AudienceField; operator: "eq" | "before" | "after"; value: string | boolean; purposeId?: string; }
export interface AudienceFilter { op: "AND"; rules: AudienceRule[]; }

const FIELD_LABELS: Record<AudienceField, string> = { consent: "Consent status for purpose", hasEmail: "Has email address", country: "Country", city: "City", ageStatus: "Age status", lastContactAt: "Last contacted" };
const DEFAULT_RULE: AudienceRule = { field: "hasEmail", operator: "eq", value: true };
const CONSENT_STATUSES = ["UNKNOWN", "GRANTED", "DENIED", "WITHDRAWN", "NOT_REQUIRED"];
const AGE_STATUSES = ["ADULT", "CHILD", "GUARDIAN_REPRESENTED", "UNKNOWN"];

export function audienceRuleForField(field: AudienceField): AudienceRule {
  if (field === "consent") return { field, operator: "eq", value: "UNKNOWN", purposeId: "" };
  if (field === "hasEmail") return { field, operator: "eq", value: true };
  if (field === "ageStatus") return { field, operator: "eq", value: "ADULT" };
  if (field === "lastContactAt") return { field, operator: "before", value: "" };
  return { field, operator: "eq", value: "" };
}

/** Builds the exact, validated audience DSL accepted by POST /audiences/preview and POST /campaigns. */
export function buildAndAudienceFilter(rules: AudienceRule[]): AudienceFilter { return { op: "AND", rules }; }

/**
 * `preview.total` is the raw filter match count BEFORE child/consent
 * suppression is applied at send time -- it is not who gets contacted.
 * `suppressedByConsent` and `suppressedAsChild` are independent counts
 * against the same matched set (a principal can appear in both), so this
 * subtracts each once: the result can only ever UNDERSTATE the true
 * contactable count (by the size of any overlap), never overstate it --
 * the safe direction for a compliance tool to be wrong in, if it must be.
 */
export function contactablePreviewCount(preview: AudiencePreview): number {
  return Math.max(preview.total - preview.suppressedByConsent - preview.suppressedAsChild, 0);
}
export function suppressedPreviewCount(preview: AudiencePreview): number {
  return preview.total - contactablePreviewCount(preview);
}

/** Audience preview is a first-class step: `total` is who MATCHES the filter, not who gets contacted -- child/consent suppression still applies at send time, so the panel below shows contactable and suppressed counts distinctly. */
export function AudienceBuilder({ onPreview, onChange }: { onPreview?: (preview: AudiencePreview, filter: AudienceFilter) => void; onChange?: (filter: AudienceFilter) => void }) {
  const [rules, setRules] = useState<AudienceRule[]>([DEFAULT_RULE]); const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const filter = buildAndAudienceFilter(rules);
  function replaceRules(next: AudienceRule[]) { setRules(next); setPreview(null); onChange?.(buildAndAudienceFilter(next)); }
  async function runPreview() { const result = await employeeApiClient.post<AudiencePreview>("/audiences/preview", { filter }); setPreview(result); onPreview?.(result, filter); }
  const previewBlocked = rules.some((rule) => (rule.field === "consent" && !rule.purposeId?.trim()) || (typeof rule.value === "string" && !rule.value.trim()));
  return <Card><CardHeader><CardTitle>Audience</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Every rule below must match. Add rules to create a composite audience.</p>
    <div className="space-y-3">{rules.map((rule, index) => <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-sm"><span className="font-medium">Rule {index + 1}</span><select aria-label={`Audience rule ${index + 1} field`} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={rule.field} onChange={(event) => { const next = [...rules]; next[index] = audienceRuleForField(event.target.value as AudienceField); replaceRules(next); }}>{(Object.keys(FIELD_LABELS) as AudienceField[]).map((field) => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}</select></label>
      {rule.field === "consent" ? <label className="space-y-1 text-sm"><span className="font-medium">Status</span><select aria-label={`Audience rule ${index + 1} value`} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={String(rule.value)} onChange={(event) => { const next = [...rules]; next[index] = { ...rule, value: event.target.value }; replaceRules(next); }}>{CONSENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label> : null}
      {rule.field === "consent" ? <label className="space-y-1 text-sm"><span className="font-medium">Purpose ID</span><input aria-label={`Audience rule ${index + 1} purpose ID`} className="flex h-9 w-full rounded-md border bg-background px-3" value={rule.purposeId ?? ""} onChange={(event) => { const next = [...rules]; next[index] = { ...rule, purposeId: event.target.value }; replaceRules(next); }} required /></label> : null}
      {rule.field === "hasEmail" ? <label className="space-y-1 text-sm"><span className="font-medium">Value</span><select aria-label={`Audience rule ${index + 1} value`} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={String(rule.value)} onChange={(event) => { const next = [...rules]; next[index] = { ...rule, value: event.target.value === "true" }; replaceRules(next); }}><option value="true">Has email</option><option value="false">Does not have email</option></select></label> : null}
      {rule.field === "ageStatus" ? <label className="space-y-1 text-sm"><span className="font-medium">Value</span><select aria-label={`Audience rule ${index + 1} value`} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" value={String(rule.value)} onChange={(event) => { const next = [...rules]; next[index] = { ...rule, value: event.target.value }; replaceRules(next); }}>{AGE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label> : null}
      {["country", "city", "lastContactAt"].includes(rule.field) ? <label className="space-y-1 text-sm"><span className="font-medium">{rule.field === "lastContactAt" ? "Before date" : "Value"}</span><input aria-label={`Audience rule ${index + 1} value`} type={rule.field === "lastContactAt" ? "date" : "text"} className="flex h-9 w-full rounded-md border bg-background px-3" value={String(rule.value)} onChange={(event) => { const next = [...rules]; next[index] = { ...rule, value: event.target.value }; replaceRules(next); }} /></label> : null}
      <div className="flex items-end"><Button type="button" variant="outline" onClick={() => replaceRules(rules.filter((_, ruleIndex) => ruleIndex !== index))} disabled={rules.length === 1}>Remove rule</Button></div>
    </div>)}</div>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => replaceRules([...rules, DEFAULT_RULE])}>Add rule</Button><Button type="button" variant="outline" onClick={() => void runPreview()} disabled={previewBlocked}>Preview audience</Button></div>
    {previewBlocked ? <p role="alert" className="text-sm text-destructive">Complete each audience rule before previewing.</p> : null}
    {preview ? <div role="status" className="space-y-3 rounded-md border bg-muted/30 p-4"><p className="text-lg font-semibold">{preview.total} people match this audience</p><p className="font-medium">{contactablePreviewCount(preview)} contactable · {suppressedPreviewCount(preview)} will be suppressed before sending</p><dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7"><div><dt className="text-muted-foreground">Contactable</dt><dd className="font-semibold">{contactablePreviewCount(preview)}</dd></div><div><dt className="text-muted-foreground">Suppressed</dt><dd className="font-semibold text-destructive">{suppressedPreviewCount(preview)}</dd></div><div><dt className="text-muted-foreground">With email</dt><dd>{preview.withEmail}</dd></div><div><dt className="text-muted-foreground">Portal only</dt><dd>{preview.portalOnly}</dd></div><div><dt className="text-muted-foreground">Consent suppressed</dt><dd>{preview.suppressedByConsent}</dd></div><div><dt className="text-muted-foreground">Child suppressed</dt><dd>{preview.suppressedAsChild}</dd></div><div><dt className="text-muted-foreground">Sample</dt><dd>{preview.sample.join(", ") || "—"}</dd></div></dl></div> : null}
  </CardContent></Card>;
}
