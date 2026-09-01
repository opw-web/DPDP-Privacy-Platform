import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { DateTime } from "../../components/shared/DateTime";
import { LineageChip, type SourceRef } from "../components/LineageChip";
import { ConflictBadge } from "../components/ConflictBadge";
import { LinkedRecordsPanel } from "../components/LinkedRecordsPanel";
import { humanizeEnum, DATA_CATEGORY_VALUES } from "../lib/enum-options";

type AgeStatus = "UNKNOWN" | "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED";

/** Mirrors one entry of `PrincipalsService.loadProfile()`'s `fields` array (`principals/principals.service.ts`). `value` is already masked server-side when the actor lacks `CAN_VIEW_ALL_PERSONAL_DATA` -- rendered here exactly as received, never altered. */
export interface PrincipalField {
  id: string;
  canonicalField: string;
  value: string;
  dataCategory: string;
  sources: readonly SourceRef[];
  isPrimary: boolean;
  conflict: boolean;
  updatedAt: string;
}

/** Mirrors `PrincipalsService.loadProfile()`'s full return shape exactly. */
export interface PrincipalDetail {
  id: string;
  reference: string;
  ageStatus: AgeStatus;
  ageStatusSource: string | null;
  ageStatusSetAt: string | null;
  lastPrincipalContactAt: string | null;
  lastPrincipalContactSource: string | null;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
  displayNameSources: readonly SourceRef[];
  fields: PrincipalField[];
}

/** Mirrors one entry of `PrincipalRecipientsService.listForPrincipal()` exactly (`principals/principal-recipients.service.ts`) -- RT-04. */
export interface RecipientActivity {
  id: string;
  recipientId: string;
  description: string;
  dataCategories: readonly string[];
  startedAt: string;
  endedAt: string | null;
  recipient: {
    id: string;
    name: string;
    type: string;
    contactEmail: string | null;
    country: string | null;
  };
}

const AGE_STATUS_SOURCE_LABEL: Record<string, string> = {
  DOB_DERIVED: "Derived from a mapped date of birth",
  SELF_DECLARED: "Self-declared by the principal",
  EMPLOYEE_SET: "Set by an employee",
};

function ageStatusVariant(status: AgeStatus): BadgeProps["variant"] {
  switch (status) {
    case "CHILD":
      return "amber";
    case "UNKNOWN":
      return "secondary";
    case "GUARDIAN_REPRESENTED":
      return "outline";
    case "ADULT":
      return "default";
  }
}

/**
 * Renders one attributed personal-data value: the value itself plus its
 * lineage chip. `sources` is required, with no default -- exactly like
 * `LineageChip` itself -- so nothing can render a profile value without
 * first having its provenance in hand. If `sources` is somehow empty (it
 * never should be: the server's `resolveProvenance` already drops any
 * field it cannot fully attribute before this component ever sees it),
 * this renders NOTHING rather than showing the value unattributed -- the
 * second half of Check 8's rule, enforced here independently of the
 * server, not merely trusted from it.
 */
export function AttributedValue({
  label,
  value,
  sources,
}: {
  label: string;
  value: string;
  sources: readonly SourceRef[];
}) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1" data-testid="attributed-value">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm">
        <span>{value}</span>
        <LineageChip sources={sources} />
      </dd>
    </div>
  );
}

interface CanonicalFieldGroup {
  canonicalField: string;
  dataCategory: string;
  conflict: boolean;
  rows: PrincipalField[];
}

/** Groups the flat `fields` array by canonical field. A group's `conflict` flag mirrors `assembly.service.ts`: EVERY row sharing a canonical field carries the same `conflict` value, true exactly when that field collected more than one distinct value. */
export function groupByCanonicalField(fields: readonly PrincipalField[]): CanonicalFieldGroup[] {
  const byField = new Map<string, PrincipalField[]>();
  for (const field of fields) {
    const bucket = byField.get(field.canonicalField) ?? [];
    bucket.push(field);
    byField.set(field.canonicalField, bucket);
  }
  return [...byField.entries()].map(([canonicalField, rows]) => ({
    canonicalField,
    dataCategory: rows[0]?.dataCategory ?? "OTHER",
    conflict: rows.some((row) => row.conflict),
    rows,
  }));
}

function FieldGroupRow({ group }: { group: CanonicalFieldGroup }) {
  const label = humanizeEnum(group.canonicalField);
  if (group.conflict) {
    return (
      <ConflictBadge
        fieldLabel={label}
        values={group.rows.map((row) => ({ value: row.value, sources: row.sources }))}
      />
    );
  }
  const primary = group.rows[0];
  if (!primary) {
    return null;
  }
  return <AttributedValue label={label} value={primary.value} sources={primary.sources} />;
}

function ProfileBlocks({ fields }: { fields: readonly PrincipalField[] }) {
  const groups = groupByCanonicalField(fields);
  const byCategory = new Map<string, CanonicalFieldGroup[]>();
  for (const group of groups) {
    const bucket = byCategory.get(group.dataCategory) ?? [];
    bucket.push(group);
    byCategory.set(group.dataCategory, bucket);
  }
  const categories = DATA_CATEGORY_VALUES.filter((category) => byCategory.has(category));

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No attributable data"
        description="This principal has no personal-data value with a fully resolved source lineage yet."
        action={{ label: "Open review queue", to: "/app/review" }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{humanizeEnum(category)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {byCategory.get(category)!.map((group) => (
              <FieldGroupRow key={group.canonicalField} group={group} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecipientsSection({ principalId }: { principalId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["principals", principalId, "recipients"],
    queryFn: () =>
      employeeApiClient.get<RecipientActivity[]>(`/principals/${principalId}/recipients`),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const activities = data ?? [];
  if (activities.length === 0) {
    return (
      <EmptyState
        title="No recipients"
        description="No active sharing activity currently overlaps a source contributing to this principal's data."
        action={{ label: "Open sharing register", to: "/app/registers" }}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="recipients-section">
      {activities.map((activity) => (
        <div key={activity.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{activity.recipient.name}</span>
            <Badge variant="outline">{humanizeEnum(activity.recipient.type)}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{activity.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {activity.dataCategories.map((category) => (
              <Badge key={category} variant="secondary">
                {humanizeEnum(category)}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Shared since <DateTime value={activity.startedAt} />
            {activity.endedAt ? (
              <>
                {" "}
                until <DateTime value={activity.endedAt} />
              </>
            ) : (
              " · ongoing"
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * `/app/principals/:id` (spec line 856): identity header, contact/profile
 * blocks (every value carrying a `LineageChip`, via `AttributedValue`),
 * conflict warnings in amber (`ConflictBadge`), linked source records with
 * Unmerge (`LinkedRecordsPanel`), and the RT-04 recipients preview.
 *
 * KNOWN GAP (see task report): "purposes served" cannot be rendered here
 * from real, attributable data. The backend exposes no read endpoint that
 * returns which `ProcessingPurpose`s are attached to a data source --
 * `PUT /api/data-sources/:id/purposes` returns that set only transiently on
 * write, and `MeService.getData()` (the one place this computation exists)
 * reaches it via direct Prisma access available only inside the backend
 * process, for the Data Principal's OWN `/me/data` view. Guessing a
 * purpose from a data category, or listing the org's entire purpose
 * register as if it all applied here, would be exactly the fabricated
 * attribution LB-02/Check 11 forbid. This section is therefore an honest
 * "not available" state with a link to the real purpose register, not a
 * guess.
 */
export function PrincipalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const principalId = id ?? "";
  const queryClient = useQueryClient();

  const {
    data: principal,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["principals", principalId],
    queryFn: () => employeeApiClient.get<PrincipalDetail>(`/principals/${principalId}`),
    enabled: principalId.length > 0,
  });

  function handleUnmerged() {
    void queryClient.invalidateQueries({ queryKey: ["principals", principalId] });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !principal) {
    return (
      <EmptyState
        title="Principal not found"
        description="This data principal could not be loaded. It may have been unmerged into a different profile."
        action={{ label: "Back to principals", to: "/app/principals" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="gap-1.5" asChild>
        <Link to="/app/principals">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to principals
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">
              {principal.displayName ?? `Principal ${principal.reference}`}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">{principal.reference}</p>
            {principal.displayName !== null ? (
              <LineageChip sources={principal.displayNameSources} />
            ) : (
              <p className="text-xs text-muted-foreground">No attributable name on file.</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
            <Badge variant={ageStatusVariant(principal.ageStatus)}>
              {humanizeEnum(principal.ageStatus)}
            </Badge>
            {principal.ageStatusSource ? (
              <span>
                {AGE_STATUS_SOURCE_LABEL[principal.ageStatusSource] ?? principal.ageStatusSource}
              </span>
            ) : null}
            {principal.ageStatusSetAt ? (
              <span>
                Set <DateTime value={principal.ageStatusSetAt} />
              </span>
            ) : null}
            {principal.lastPrincipalContactAt ? (
              <span>
                Last contact <DateTime value={principal.lastPrincipalContactAt} />
              </span>
            ) : null}
            <span>
              First seen <DateTime value={principal.createdAt} />
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/principals/${principal.id}/evidence`}>Open evidence file (EV-03)</Link>
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Contact and profile">
        <h2 className="mb-3 text-sm font-semibold">Contact and profile</h2>
        <ProfileBlocks fields={principal.fields} />
      </section>

      <section aria-label="Linked source records">
        <h2 className="mb-3 text-sm font-semibold">Linked source records</h2>
        <LinkedRecordsPanel principalId={principalId} onUnmerged={handleUnmerged} />
      </section>

      <section aria-label="Purposes served">
        <h2 className="mb-3 text-sm font-semibold">Purposes served</h2>
        <EmptyState
          title="Not available from this view"
          description="Which processing purposes govern this principal's data is recorded per data source, not yet surfaced on this profile. Check the purposes attached to each linked source, or the purposes register."
          action={{ label: "Open purposes register", to: "/app/purposes" }}
        />
      </section>

      <section aria-label="Recipients">
        <h2 className="mb-3 text-sm font-semibold">Recipients (RT-04)</h2>
        <RecipientsSection principalId={principalId} />
      </section>
    </div>
  );
}
