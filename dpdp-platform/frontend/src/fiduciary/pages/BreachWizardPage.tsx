import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { DATA_CATEGORY_OPTIONS } from "../lib/enum-options";
import type { DataCategory, PublicDataSource } from "../lib/data-sources-api";

export interface BreachWizardValues {
  title: string;
  description: string;
  occurredAt: string;
  becameAwareAt: string;
  affectedSourceIds: readonly string[];
  dataCategories: readonly DataCategory[];
  /** Step 4: how affected principals were selected. Manual/CSV wins over "everyone from these sources" when non-empty. */
  affectedPrincipalsCsv?: string;
  /** Rule 7(1) narrative elements (step 5). All optional at this layer -- the backend DTO agrees -- but a notice generated from a breach missing any of these will fail to render. */
  natureExtentTiming?: string;
  consequences?: string;
  mitigationMeasures?: string;
  safetyMeasuresForPrincipals?: string;
  responderContact?: string;
  /** Board detailed-report fields (step 6, Rule 7(2)(b)). */
  boardBroadFacts?: string;
  boardMitigation?: string;
  boardPerpetratorFindings?: string;
  boardRemedialMeasures?: string;
}

export interface CreateBreachPayload {
  title: string;
  description: string;
  occurredAt: string;
  becameAwareAt: string;
  affectedSourceIds: string[];
  dataCategories: DataCategory[];
  csv?: string;
  natureExtentTiming?: string;
  consequences?: string;
  mitigationMeasures?: string;
  safetyMeasuresForPrincipals?: string;
  responderContact?: string;
  boardBroadFacts?: string;
  boardMitigation?: string;
  boardPerpetratorFindings?: string;
  boardRemedialMeasures?: string;
}

export interface AffectedPreviewResult {
  count: number;
  principalIds: string[];
  includesChildren: boolean;
}

export type AffectedSelectionMode = "sources" | "manual";

export function hasRequiredBreachTimes(
  occurredAt: string,
  becameAwareAt: string,
): boolean {
  return Boolean(occurredAt && becameAwareAt);
}

export function hasRequiredAffectedSources(sourceIds: readonly string[]): boolean {
  return sourceIds.some((sourceId) => sourceId.trim().length > 0);
}

/** Convert local datetime input values to the ISO strings expected by the API. */
export function buildBreachPayload(values: BreachWizardValues): CreateBreachPayload {
  const optionalText = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    occurredAt: new Date(values.occurredAt).toISOString(),
    becameAwareAt: new Date(values.becameAwareAt).toISOString(),
    affectedSourceIds: [...new Set(values.affectedSourceIds.filter((sourceId) => sourceId.trim()))],
    dataCategories: [...values.dataCategories],
    csv: optionalText(values.affectedPrincipalsCsv),
    natureExtentTiming: optionalText(values.natureExtentTiming),
    consequences: optionalText(values.consequences),
    mitigationMeasures: optionalText(values.mitigationMeasures),
    safetyMeasuresForPrincipals: optionalText(values.safetyMeasuresForPrincipals),
    responderContact: optionalText(values.responderContact),
    boardBroadFacts: optionalText(values.boardBroadFacts),
    boardMitigation: optionalText(values.boardMitigation),
    boardPerpetratorFindings: optionalText(values.boardPerpetratorFindings),
    boardRemedialMeasures: optionalText(values.boardRemedialMeasures),
  };
}

/** The payload `POST /breaches/:id/affected/preview` (id unused server-side) accepts for the current selection. */
export function buildAffectedPreviewPayload(
  mode: AffectedSelectionMode,
  sourceIds: readonly string[],
  manualText: string,
): Record<string, unknown> {
  if (mode === "manual") return { csv: manualText };
  return { sourceIds: [...sourceIds] };
}

/** The six Rule 7(1) elements, in the order the spec lists them, as named fields -- not a free-text blob -- so a reviewer sees exactly which are present. */
export const RULE_7_1_ELEMENTS: ReadonlyArray<{
  key: "reference" | keyof Pick<
    BreachWizardValues,
    | "natureExtentTiming"
    | "consequences"
    | "mitigationMeasures"
    | "safetyMeasuresForPrincipals"
    | "responderContact"
  >;
  label: string;
}> = [
  { key: "reference", label: "Breach reference" },
  { key: "natureExtentTiming", label: "Nature, extent and timing of the breach" },
  { key: "consequences", label: "Consequences likely to affect the data principal" },
  { key: "mitigationMeasures", label: "Mitigation measures implemented and being implemented" },
  { key: "safetyMeasuresForPrincipals", label: "Safety measures the data principal may take" },
  { key: "responderContact", label: "Business/responder contact information" },
];

/** Labels of the five narrative fields that are still empty -- used to warn before creation that a generated notice would fail to render. */
export function missingRule71NarrativeLabels(values: BreachWizardValues): string[] {
  return RULE_7_1_ELEMENTS.filter((element) => element.key !== "reference")
    .filter((element) => !values[element.key as keyof BreachWizardValues]?.toString().trim())
    .map((element) => element.label);
}

function SourceSelector({
  sources,
  selectedSourceIds,
  onToggle,
}: {
  sources: readonly PublicDataSource[];
  selectedSourceIds: readonly string[];
  onToggle: (sourceId: string, selected: boolean) => void;
}) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">No data sources are available to attach to this incident.</p>;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Affected data sources (required)</legend>
      <p className="text-xs text-muted-foreground">
        Select every connected system that held the affected personal data.
      </p>
      <div className="space-y-2 rounded-md border p-3">
        {sources.map((source) => (
          <label key={source.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={source.name}
              checked={selectedSourceIds.includes(source.id)}
              onChange={(event) => onToggle(source.id, event.target.checked)}
            />
            <span>{source.name}</span>
            <span className="text-xs text-muted-foreground">({source.status})</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CategorySelector({
  selectedCategories,
  onToggle,
}: {
  selectedCategories: readonly DataCategory[];
  onToggle: (category: DataCategory, selected: boolean) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Data categories</legend>
      <p className="text-xs text-muted-foreground">Record the categories involved, if known.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {DATA_CATEGORY_OPTIONS.map((option) => {
          const category = option.value as DataCategory;
          return (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={option.label}
                checked={selectedCategories.includes(category)}
                onChange={(event) => onToggle(category, event.target.checked)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function NarrativeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
      <textarea
        aria-label={label}
        className="flex min-h-20 w-full rounded border p-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function BreachWizardPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [becameAwareAt, setBecameAwareAt] = useState("");
  const [affectedSourceIds, setAffectedSourceIds] = useState<string[]>([]);
  const [dataCategories, setDataCategories] = useState<DataCategory[]>([]);

  // Step 4: affected principals, with a preview count before committing.
  const [affectedMode, setAffectedMode] = useState<AffectedSelectionMode>("sources");
  const [manualPrincipalsText, setManualPrincipalsText] = useState("");
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);

  // Step 5: the five Rule 7(1) narrative elements.
  const [natureExtentTiming, setNatureExtentTiming] = useState("");
  const [consequences, setConsequences] = useState("");
  const [mitigationMeasures, setMitigationMeasures] = useState("");
  const [safetyMeasuresForPrincipals, setSafetyMeasuresForPrincipals] = useState("");
  const [responderContact, setResponderContact] = useState("");

  // Step 6: Board detailed-report fields (Rule 7(2)(b)).
  const [boardBroadFacts, setBoardBroadFacts] = useState("");
  const [boardMitigation, setBoardMitigation] = useState("");
  const [boardPerpetratorFindings, setBoardPerpetratorFindings] = useState("");
  const [boardRemedialMeasures, setBoardRemedialMeasures] = useState("");

  const sourcesQuery = useQuery({
    queryKey: ["data-sources"],
    queryFn: () => employeeApiClient.get<PublicDataSource[]>("/data-sources"),
  });

  const previewAffected = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      employeeApiClient.post<AffectedPreviewResult>("/breaches/new/affected/preview", payload),
    onSuccess: (_result, payload) => setPreviewedKey(JSON.stringify(payload)),
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.message
          ? error.message
          : "Could not preview affected principals.",
      ),
  });

  const wizardValues: BreachWizardValues = {
    title,
    description,
    occurredAt,
    becameAwareAt,
    affectedSourceIds,
    dataCategories,
    affectedPrincipalsCsv: affectedMode === "manual" ? manualPrincipalsText : undefined,
    natureExtentTiming,
    consequences,
    mitigationMeasures,
    safetyMeasuresForPrincipals,
    responderContact,
    boardBroadFacts,
    boardMitigation,
    boardPerpetratorFindings,
    boardRemedialMeasures,
  };

  const save = useMutation({
    mutationFn: () => employeeApiClient.post<{ id: string }>("/breaches", buildBreachPayload(wizardValues)),
    onSuccess: (breach) => nav(`/app/breaches/${breach.id}`),
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.message ? error.message : "Could not create the breach.",
      ),
  });

  const missingTimes = !hasRequiredBreachTimes(occurredAt, becameAwareAt);
  const missingSources = !hasRequiredAffectedSources(affectedSourceIds);
  const sources = sourcesQuery.data ?? [];

  const currentAffectedPreviewPayload = buildAffectedPreviewPayload(
    affectedMode,
    affectedSourceIds,
    manualPrincipalsText,
  );
  const affectedPreviewIsFresh =
    previewedKey === JSON.stringify(currentAffectedPreviewPayload) && previewAffected.isSuccess;
  const missingAffectedPreview = !affectedPreviewIsFresh;
  const missingNarrativeLabels = missingRule71NarrativeLabels(wizardValues);

  function toggleSource(sourceId: string, selected: boolean) {
    setAffectedSourceIds((current) => {
      if (selected) return current.includes(sourceId) ? current : [...current, sourceId];
      return current.filter((id) => id !== sourceId);
    });
    setPreviewedKey(null);
  }

  function toggleCategory(category: DataCategory, selected: boolean) {
    setDataCategories((current) => {
      if (selected) return current.includes(category) ? current : [...current, category];
      return current.filter((value) => value !== category);
    });
  }

  function runAffectedPreview() {
    previewAffected.mutate(currentAffectedPreviewPayload);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a breach · step {step} of 8</CardTitle>
        <p className="text-sm text-muted-foreground">
          Each step preserves an auditable incident record. Awareness starts every obligation clock.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 ? (
          <>
            <label className="space-y-1 text-sm">
              Title
              <input
                className="flex h-9 w-full rounded border px-3"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              Description
              <textarea
                className="flex min-h-24 w-full rounded border p-3"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            {sourcesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading data sources…</p> : null}
            {sourcesQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load data sources. Refresh and try again before recording the breach.
              </p>
            ) : (
              <SourceSelector
                sources={sources}
                selectedSourceIds={affectedSourceIds}
                onToggle={toggleSource}
              />
            )}
            <CategorySelector selectedCategories={dataCategories} onToggle={toggleCategory} />
          </>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              When it occurred
              <input
                type="datetime-local"
                className="flex h-9 w-full rounded border px-3"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-sm">
              When the fiduciary became aware (required)
              <input
                type="datetime-local"
                className="flex h-9 w-full rounded border px-3"
                value={becameAwareAt}
                onChange={(event) => setBecameAwareAt(event.target.value)}
                required
              />
            </label>
            {!becameAwareAt ? (
              <p role="alert" className="text-sm text-destructive">
                Became aware at is required; obligations cannot be calculated without it.
              </p>
            ) : null}
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Review the systems and categories before creating the incident.
            </p>
            {missingSources ? (
              <>
                {sourcesQuery.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Data sources could not be loaded.
                  </p>
                ) : (
                  <SourceSelector
                    sources={sources}
                    selectedSourceIds={affectedSourceIds}
                    onToggle={toggleSource}
                  />
                )}
                <p role="alert" className="text-sm text-destructive">
                  Select at least one affected data source before continuing.
                </p>
              </>
            ) : (
              <p className="text-sm">Affected sources: {affectedSourceIds.length}</p>
            )}
            <p className="text-sm">Data categories recorded: {dataCategories.length}</p>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select the affected data principals. Preview the count before committing it with the
              incident.
            </p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Selection method</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="affected-mode"
                  checked={affectedMode === "sources"}
                  onChange={() => {
                    setAffectedMode("sources");
                    setPreviewedKey(null);
                  }}
                />
                Everyone sourced from the selected data sources ({affectedSourceIds.length} selected)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="affected-mode"
                  checked={affectedMode === "manual"}
                  onChange={() => {
                    setAffectedMode("manual");
                    setPreviewedKey(null);
                  }}
                />
                Manual list / CSV of data principal IDs
              </label>
            </fieldset>
            {affectedMode === "manual" ? (
              <label className="space-y-1 text-sm">
                Data principal IDs (one per line, or CSV with the ID in the first column)
                <textarea
                  aria-label="Data principal IDs"
                  className="flex min-h-24 w-full rounded border p-3 font-mono text-xs"
                  value={manualPrincipalsText}
                  onChange={(event) => {
                    setManualPrincipalsText(event.target.value);
                    setPreviewedKey(null);
                  }}
                />
              </label>
            ) : null}
            <Button type="button" variant="outline" onClick={runAffectedPreview} disabled={previewAffected.isPending}>
              {previewAffected.isPending ? "Previewing…" : "Preview affected principals"}
            </Button>
            {affectedPreviewIsFresh && previewAffected.data ? (
              <div role="status" className="space-y-1 rounded-md border bg-muted/30 p-4 text-sm">
                <p className="text-lg font-semibold">{previewAffected.data.count} data principals selected</p>
                {previewAffected.data.includesChildren ? (
                  <p className="font-medium text-destructive">
                    This selection includes at least one CHILD principal; the incident will be flagged
                    accordingly.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run a preview to see the count before continuing -- the preview must be re-run whenever
                the selection changes.
              </p>
            )}
          </div>
        ) : null}
        {step === 5 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The five Rule 7(1) narrative elements of the eventual breach notice. Each is its own field
              so an approver can see exactly which are present.
            </p>
            <NarrativeField
              label="Nature, extent and timing of the breach"
              hint="What happened, how much data and how many people, and when."
              value={natureExtentTiming}
              onChange={setNatureExtentTiming}
            />
            <NarrativeField
              label="Consequences likely to affect the data principal"
              hint="The realistic impact on the affected person."
              value={consequences}
              onChange={setConsequences}
            />
            <NarrativeField
              label="Mitigation measures implemented and being implemented"
              hint="What the organization has already done and is still doing."
              value={mitigationMeasures}
              onChange={setMitigationMeasures}
            />
            <NarrativeField
              label="Safety measures the data principal may take"
              hint="Concrete steps she can take to protect herself."
              value={safetyMeasuresForPrincipals}
              onChange={setSafetyMeasuresForPrincipals}
            />
            <NarrativeField
              label="Business/responder contact information"
              hint="Who she can contact about this breach."
              value={responderContact}
              onChange={setResponderContact}
            />
          </div>
        ) : null}
        {step === 6 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Board detailed-report fields (Rule 7(2)(b)) -- these are not required to create the
              incident but are needed to complete the BOARD_DETAIL obligation later.
            </p>
            <NarrativeField
              label="Updated description and broad facts"
              hint="The fuller account of what happened, for the Board's detailed report."
              value={boardBroadFacts}
              onChange={setBoardBroadFacts}
            />
            <NarrativeField
              label="Mitigation for the Board report"
              hint="Measures taken or proposed to be taken to mitigate the breach."
              value={boardMitigation}
              onChange={setBoardMitigation}
            />
            <NarrativeField
              label="Findings on the person who caused the breach"
              hint="What is known, if anything, about who caused it."
              value={boardPerpetratorFindings}
              onChange={setBoardPerpetratorFindings}
            />
            <NarrativeField
              label="Remedial measures to prevent recurrence"
              hint="Steps to stop this class of breach happening again."
              value={boardRemedialMeasures}
              onChange={setBoardRemedialMeasures}
            />
          </div>
        ) : null}
        {step === 7 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the notice this incident will generate. All six Rule 7(1) elements are shown
              individually below.
            </p>
            {missingNarrativeLabels.length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {missingNarrativeLabels.length} of 6 Rule 7(1) elements are not yet set (
                {missingNarrativeLabels.join(", ")}). A notice generated from this record will fail to
                render until they are completed -- go back to step 5 to fill them in.
              </p>
            ) : (
              <p className="text-sm font-medium text-foreground">
                All six Rule 7(1) elements are present.
              </p>
            )}
            <dl className="space-y-3 rounded-md border p-4 text-sm">
              <div>
                <dt className="font-medium">Breach reference</dt>
                <dd className="text-muted-foreground">Assigned automatically (format BR-NNNNNN) when the incident is created.</dd>
              </div>
              {[
                { label: "Nature, extent and timing of the breach", value: natureExtentTiming },
                { label: "Consequences likely to affect the data principal", value: consequences },
                { label: "Mitigation measures implemented and being implemented", value: mitigationMeasures },
                { label: "Safety measures the data principal may take", value: safetyMeasuresForPrincipals },
                { label: "Business/responder contact information", value: responderContact },
              ].map((element) => (
                <div key={element.label}>
                  <dt className="font-medium">{element.label}</dt>
                  <dd className={element.value.trim() ? "" : "italic text-destructive"}>
                    {element.value.trim() || "Not yet provided"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm">
              Affected data principals: {affectedPreviewIsFresh ? (previewAffected.data?.count ?? 0) : "not yet previewed"}
            </p>
          </div>
        ) : null}
        {step === 8 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ready to create the incident. Every obligation clock starts at the awareness time recorded
              in step 2.
            </p>
            {missingNarrativeLabels.length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {missingNarrativeLabels.length} Rule 7(1) narrative element(s) are still missing. You can
                still create the incident and fill them in later, but a notice cannot be generated until
                they are complete.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))}>
              Previous step
            </Button>
          ) : null}
          {step < 8 ? (
            <Button
              type="button"
              onClick={() => setStep((current) => Math.min(8, current + 1))}
              disabled={
                (step === 2 && missingTimes) ||
                (step === 3 && missingSources) ||
                (step === 4 && missingAffectedPreview)
              }
            >
              Next step
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={missingTimes || missingSources || save.isPending}
            >
              {save.isPending ? "Creating…" : "Create breach"}
            </Button>
          )}
        </div>
        {save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof ApiError && save.error.message ? save.error.message : "Could not create the breach."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
