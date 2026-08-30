import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Skeleton } from "../../components/shared/Skeleton";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/shared/EmptyState";
import { Step1Connection } from "../components/wizard/Step1Connection";
import { Step3Mapping } from "../components/wizard/Step3Mapping";
import { Step4Purposes } from "../components/wizard/Step4Purposes";
import { Step5Declarations } from "../components/wizard/Step5Declarations";
import { SyncHistoryTable } from "../components/SyncHistoryTable";
import {
  mappingsQueryKey,
  purposesQueryKey,
  type AttachedPurpose,
  type PublicDataSource,
  type PublicDataSourceField,
  type ReplaceMappingsResult,
} from "../lib/data-sources-api";

interface SecurityMeasure {
  id: string;
  dataSourceId: string | null;
  ruleReference: string;
  measureType: string;
  implemented: boolean;
  description: string;
  evidenceReference: string | null;
  lastReviewedAt: string | null;
  reviewedByEmployeeId: string | null;
}

interface SecurityMeasureGroup {
  ruleReference: string;
  totalCount: number;
  implementedCount: number;
  measures: SecurityMeasure[];
}

/**
 * Reads this source's CURRENT mapping set and standing CN-02 warnings.
 * `GET /api/data-sources/:id/mappings` is a concurrent backend addition
 * (see `data-sources-api.ts`'s docstring, concern 2) -- built against the
 * `{ mappings, warnings }` shape the coordinator specified, which the PUT
 * route already returns unchanged. A successful save from `Step3Mapping`
 * writes the same query key via `cacheMappingsResult`, so this reflects a
 * just-made change immediately, not only after a refetch.
 */
function useDataSourceMappings(dataSourceId: string) {
  return useQuery<ReplaceMappingsResult>({
    queryKey: mappingsQueryKey(dataSourceId),
    queryFn: () =>
      employeeApiClient.get<ReplaceMappingsResult>(`/data-sources/${dataSourceId}/mappings`),
  });
}

/** Same pattern as `useDataSourceMappings`, for the concurrent `GET .../purposes` addition -- assumed to return a bare array (see `data-sources-api.ts`'s docstring, concern 2). */
function useDataSourcePurposes(dataSourceId: string) {
  return useQuery<AttachedPurpose[]>({
    queryKey: purposesQueryKey(dataSourceId),
    queryFn: () =>
      employeeApiClient.get<AttachedPurpose[]>(`/data-sources/${dataSourceId}/purposes`),
  });
}

function OverviewTab({ dataSource }: { dataSource: PublicDataSource }) {
  const queryClient = useQueryClient();
  return (
    <div className="space-y-6">
      <Step1Connection
        dataSource={dataSource}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["data-source", dataSource.id] });
        }}
      />
      <div className="border-t border-border pt-6">
        <h3 className="mb-3 text-sm font-semibold">Hosting &amp; public-availability declarations</h3>
        <Step5Declarations
          dataSourceId={dataSource.id}
          initial={dataSource}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["data-source", dataSource.id] });
          }}
        />
      </div>
    </div>
  );
}

/**
 * Field Mapping tab: the current mapping set plus its standing CN-02
 * warnings, both from `GET /data-sources/:id/mappings` -- rendered on a
 * plain read, not only right after a save (the coordinator's correction:
 * CN-02 is a standing property of the mapping, so it must show every time
 * the mapping does).
 */
function FieldMappingTab({ dataSourceId }: { dataSourceId: string }) {
  const { data: mappingsResult, isLoading: isLoadingMappings } = useDataSourceMappings(dataSourceId);
  const { data: fields, isLoading: isLoadingFields } = useQuery({
    queryKey: ["data-source-fields", dataSourceId],
    queryFn: () =>
      employeeApiClient.get<PublicDataSourceField[]>(`/data-sources/${dataSourceId}/fields`),
  });

  if (isLoadingMappings || isLoadingFields) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Step3Mapping
      dataSourceId={dataSourceId}
      fields={fields ?? []}
      initialMappings={mappingsResult?.mappings}
      initialWarnings={mappingsResult?.warnings}
      onSaved={() => undefined}
    />
  );
}

/** Step4Purposes itself renders the "no purpose attached" explained state (never a default) once `attachedPurposes` resolves to an empty array -- no separate banner needed here. */
function PurposesTab({ dataSourceId }: { dataSourceId: string }) {
  const { data: attachedPurposes, isLoading } = useDataSourcePurposes(dataSourceId);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Step4Purposes
      dataSourceId={dataSourceId}
      initialPurposeIds={attachedPurposes?.map((purpose) => purpose.id)}
      onSaved={() => undefined}
    />
  );
}

function SecurityMeasuresTab({ dataSourceId }: { dataSourceId: string }) {
  const { data: groups, isLoading } = useQuery({
    queryKey: ["registers", "security"],
    queryFn: () => employeeApiClient.get<SecurityMeasureGroup[]>("/registers/security"),
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const relevantGroups = (groups ?? [])
    .map((group) => ({
      ...group,
      measures: group.measures.filter((measure) => measure.dataSourceId === dataSourceId),
    }))
    .filter((group) => group.measures.length > 0);

  if (relevantGroups.length === 0) {
    return (
      <EmptyState
        description="No security measures have been recorded against this data source yet. Measures scoped to a specific source are recorded from the Registers screen."
        action={{ label: "Go to Registers", to: "/app/registers" }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {relevantGroups.map((group) => (
        <div key={group.ruleReference} className="rounded-md border border-border p-4">
          <h3 className="mb-2 text-sm font-semibold">{group.ruleReference}</h3>
          <ul className="space-y-2">
            {group.measures.map((measure) => (
              <li key={measure.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{measure.measureType}</p>
                  <p className="text-xs text-muted-foreground">{measure.description}</p>
                  {measure.lastReviewedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Last reviewed <DateTime value={measure.lastReviewedAt} />
                    </p>
                  ) : null}
                </div>
                <Badge variant={measure.implemented ? "success" : "amber"}>
                  {measure.implemented ? "Implemented" : "Not yet implemented"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * `/app/data-sources/:id` (spec line 852): tabs Overview · Field Mapping ·
 * Purposes · Security Measures · Sync History.
 */
export function DataSourceDetailPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: dataSource,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["data-source", id],
    queryFn: () => employeeApiClient.get<PublicDataSource>(`/data-sources/${id}`),
    enabled: Boolean(id),
  });

  if (!id) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !dataSource) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Data source not found"
        description="This data source may have been deleted, or you may not have access to it."
        action={{ label: "Back to data sources", to: "/app/data-sources" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{dataSource.name}</h1>
        <p className="text-sm text-muted-foreground">{dataSource.systemType}</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mapping">Field Mapping</TabsTrigger>
          <TabsTrigger value="purposes">Purposes</TabsTrigger>
          <TabsTrigger value="security">Security Measures</TabsTrigger>
          <TabsTrigger value="sync">Sync History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab dataSource={dataSource} />
        </TabsContent>
        <TabsContent value="mapping">
          <FieldMappingTab dataSourceId={dataSource.id} />
        </TabsContent>
        <TabsContent value="purposes">
          <PurposesTab dataSourceId={dataSource.id} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityMeasuresTab dataSourceId={dataSource.id} />
        </TabsContent>
        <TabsContent value="sync">
          <SyncHistoryTable dataSourceId={dataSource.id} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        <Link to="/app/data-sources" className="hover:underline">
          &larr; Back to data sources
        </Link>
      </p>
    </div>
  );
}
