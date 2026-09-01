import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { employeeApiClient } from "../../lib/api-client";
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
}

export interface CreateBreachPayload {
  title: string;
  description: string;
  occurredAt: string;
  becameAwareAt: string;
  affectedSourceIds: string[];
  dataCategories: DataCategory[];
}

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
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    occurredAt: new Date(values.occurredAt).toISOString(),
    becameAwareAt: new Date(values.becameAwareAt).toISOString(),
    affectedSourceIds: [...new Set(values.affectedSourceIds.filter((sourceId) => sourceId.trim()))],
    dataCategories: [...values.dataCategories],
  };
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

export function BreachWizardPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [becameAwareAt, setBecameAwareAt] = useState("");
  const [affectedSourceIds, setAffectedSourceIds] = useState<string[]>([]);
  const [dataCategories, setDataCategories] = useState<DataCategory[]>([]);

  const sourcesQuery = useQuery({
    queryKey: ["data-sources"],
    queryFn: () => employeeApiClient.get<PublicDataSource[]>("/data-sources"),
  });

  const save = useMutation({
    mutationFn: () =>
      employeeApiClient.post<{ id: string }>(
        "/breaches",
        buildBreachPayload({
          title,
          description,
          occurredAt,
          becameAwareAt,
          affectedSourceIds,
          dataCategories,
        }),
      ),
    onSuccess: (breach) => nav(`/app/breaches/${breach.id}`),
  });

  const missingTimes = !hasRequiredBreachTimes(occurredAt, becameAwareAt);
  const missingSources = !hasRequiredAffectedSources(affectedSourceIds);
  const sources = sourcesQuery.data ?? [];

  function toggleSource(sourceId: string, selected: boolean) {
    setAffectedSourceIds((current) => {
      if (selected) return current.includes(sourceId) ? current : [...current, sourceId];
      return current.filter((id) => id !== sourceId);
    });
  }

  function toggleCategory(category: DataCategory, selected: boolean) {
    setDataCategories((current) => {
      if (selected) return current.includes(category) ? current : [...current, category];
      return current.filter((value) => value !== category);
    });
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
        {step > 3 ? (
          <p className="text-sm text-muted-foreground">
            Review affected principals, containment, communications, Board details and closure in the remaining steps.
          </p>
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
              disabled={(step === 2 && missingTimes) || (step === 3 && missingSources)}
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
            {save.error instanceof Error ? save.error.message : "Could not create the breach."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
