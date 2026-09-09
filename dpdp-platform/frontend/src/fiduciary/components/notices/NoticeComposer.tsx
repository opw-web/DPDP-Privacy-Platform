import { useMemo, useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import type { EligibleItemisedField, NoticeItemisedField, NoticePurposeStatement } from "./types";
import { NoticeStandalonePreview } from "./NoticePreview";

export interface NoticeDraftValues {
  bodyMarkdown: string;
  itemisedDataFields: NoticeItemisedField[];
  withdrawalUrl: string;
  rightsUrl: string;
  boardComplaintUrl: string;
}

interface NoticeComposerProps {
  eligibleFields: EligibleItemisedField[];
  purposeStatements: NoticePurposeStatement[];
  initialValues?: Partial<NoticeDraftValues>;
  onSave: (values: NoticeDraftValues) => void;
  saving?: boolean;
}

/** Composes a notice from mapped data, purpose statements and Rule 3(c) links. */
export function NoticeComposer({ eligibleFields, purposeStatements, initialValues, onSave, saving }: NoticeComposerProps) {
  const [bodyMarkdown, setBodyMarkdown] = useState(initialValues?.bodyMarkdown ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialValues?.itemisedDataFields?.map((field) => field.sourceFieldMappingId) ?? [],
  );
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialValues?.itemisedDataFields ?? []).map((field) => [field.sourceFieldMappingId, field.label])),
  );
  const [withdrawalUrl, setWithdrawalUrl] = useState(initialValues?.withdrawalUrl ?? "");
  const [rightsUrl, setRightsUrl] = useState(initialValues?.rightsUrl ?? "");
  const [boardComplaintUrl, setBoardComplaintUrl] = useState(initialValues?.boardComplaintUrl ?? "");
  const [previewing, setPreviewing] = useState(false);

  const itemisedDataFields = useMemo(() => eligibleFields
    .filter((field) => selectedIds.includes(field.sourceFieldMappingId))
    .map((field) => ({
      sourceFieldMappingId: field.sourceFieldMappingId,
      canonicalField: field.canonicalField,
      dataCategory: field.dataCategory,
      label: labels[field.sourceFieldMappingId]?.trim() || field.suggestedLabel,
    })), [eligibleFields, labels, selectedIds]);

  if (previewing) {
    // The return control sits outside the preview: NoticeStandalonePreview is
    // the Rule 3(a) render boundary and must carry no editing chrome of its own.
    return <div className="space-y-3">
      <Button type="button" variant="outline" onClick={() => setPreviewing(false)}>Back to editing</Button>
      {bodyMarkdown.trim().length === 0 ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">This draft has no body text yet, so the preview below shows only its data, purposes and links.</p> : null}
      <NoticeStandalonePreview bodyMarkdown={bodyMarkdown} itemisedDataFields={itemisedDataFields} purposeStatements={purposeStatements} withdrawalUrl={withdrawalUrl} rightsUrl={rightsUrl} boardComplaintUrl={boardComplaintUrl} />
    </div>;
  }

  function toggleField(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...current, id] : current.filter((entry) => entry !== id));
  }

  return (
    <form className="space-y-8" onSubmit={(event) => { event.preventDefault(); onSave({ bodyMarkdown, itemisedDataFields, withdrawalUrl, rightsUrl, boardComplaintUrl }); }}>
      <section className="space-y-3">
        <div><h2 className="text-base font-semibold">Notice body</h2><p className="text-sm text-muted-foreground">Write plain-language content. Use “Standalone preview” below to see it exactly as a person would, with none of this console around it.</p></div>
        <div data-color-mode="light"><MDEditor value={bodyMarkdown} onChange={(value) => setBodyMarkdown(value ?? "")} height={280} textareaProps={{ "aria-label": "Notice body" }} /></div>
      </section>

      <section className="space-y-3" aria-labelledby="itemised-data-heading">
        <div><h2 id="itemised-data-heading" className="text-base font-semibold">Itemised personal data</h2><p className="text-sm text-muted-foreground">Tick fields from the mappings used by these purposes. At least one is required for publication.</p></div>
        {eligibleFields.length === 0 ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">No eligible mapped personal-data fields are available. Connect a data source and attach it to a selected purpose before publication.</p> : eligibleFields.map((field) => {
          const checked = selectedIds.includes(field.sourceFieldMappingId);
          return <div key={field.sourceFieldMappingId} className="rounded-md border p-3">
            <div className="flex items-center gap-2"><Checkbox id={`field-${field.sourceFieldMappingId}`} type="checkbox" checked={checked} onChange={(event) => toggleField(field.sourceFieldMappingId, event.target.checked)} /><Label htmlFor={`field-${field.sourceFieldMappingId}`}>{field.suggestedLabel}</Label></div>
            <p className="mt-1 text-xs text-muted-foreground">{field.dataSourceName} · {field.sourceField} · {field.dataCategory}</p>
            {checked ? <Input className="mt-2" aria-label={`Label for ${field.suggestedLabel}`} value={labels[field.sourceFieldMappingId] ?? field.suggestedLabel} onChange={(event) => setLabels((current) => ({ ...current, [field.sourceFieldMappingId]: event.target.value }))} /> : null}
          </div>;
        })}
      </section>

      <section className="space-y-3"><div><h2 className="text-base font-semibold">Purposes and goods or services</h2><p className="text-sm text-muted-foreground">These statements are pulled from the selected purposes and are refreshed when published.</p></div>
        {purposeStatements.map((purpose) => <div key={purpose.purposeId} className="rounded-md border p-3"><p className="font-medium">{purpose.purposeName}</p><p className={purpose.goodsOrServices ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{purpose.goodsOrServices || "Missing goods/services description — publication will be blocked."}</p></div>)}
      </section>

      <section className="space-y-3"><div><h2 className="text-base font-semibold">Required Rule 3(c) links</h2><p className="text-sm text-muted-foreground">All three links are required before this notice can be published.</p></div>
        <div className="grid gap-3 md:grid-cols-3">{[["withdrawal-url", "Withdrawal URL", withdrawalUrl, setWithdrawalUrl], ["rights-url", "Rights URL", rightsUrl, setRightsUrl], ["board-url", "Board complaint URL", boardComplaintUrl, setBoardComplaintUrl]].map(([id, label, value, setter]) => <div key={id as string} className="space-y-1"><Label htmlFor={id as string}>{label as string}</Label><Input id={id as string} type="url" value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder="https://…" /></div>)}</div>
      </section>
      <div className="flex gap-3"><Button type="submit" disabled={saving || bodyMarkdown.trim().length === 0}>{saving ? "Saving…" : "Save draft version"}</Button><Button type="button" variant="outline" onClick={() => setPreviewing(true)}>Standalone preview</Button></div>
    </form>
  );
}
