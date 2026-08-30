import { Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, RefreshCw } from "lucide-react";
import { employeeApiClient, ApiError } from "../../lib/api-client";
import { DataTable } from "../../components/shared/DataTable";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { PermissionGate } from "../../components/shared/PermissionGate";
import type { DataSourceStatus, PublicDataSource, SyncJob } from "../lib/data-sources-api";

const STATUS_VARIANT: Record<DataSourceStatus, "secondary" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  CONNECTED: "success",
  ERROR: "destructive",
  DISABLED: "outline",
};

interface SyncNowButtonProps {
  dataSourceId: string;
}

function SyncNowButton({ dataSourceId }: SyncNowButtonProps) {
  const queryClient = useQueryClient();

  const trigger = useMutation({
    mutationFn: () => employeeApiClient.post(`/data-sources/${dataSourceId}/sync`),
    onSuccess: async () => {
      toast.success("Sync queued.");
      await queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
    },
    onError: (error: unknown) => {
      // A concurrent sync is a clear toast, never an error page (task brief).
      if (error instanceof ApiError && error.status === 409) {
        toast.error(
          error.message || "A sync is already running for this data source.",
        );
        return;
      }
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not queue a sync for this data source.";
      toast.error(message);
    },
  });

  return (
    <PermissionGate permission="CAN_RUN_SYNC">
      <Button
        size="sm"
        variant="outline"
        disabled={trigger.isPending}
        onClick={() => trigger.mutate()}
      >
        <RefreshCw className={trigger.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        Sync now
      </Button>
    </PermissionGate>
  );
}

/**
 * `/app/data-sources` (spec line 850): table with status, last sync,
 * record count, and a Sync now action. "Record count" has no
 * per-source total anywhere in this backend's API (`InventorySummary.
 * rawRecordCount` is org-wide only) -- the closest honest figure
 * available is the most recent `SyncJob.recordsRead` for that source, so
 * that is what is shown, labelled "Records (last sync)" rather than
 * implied to be a running total. Flagged in task-24-report.md.
 */
export function DataSourcesPage() {
  const { data: sources, isLoading } = useQuery({
    queryKey: ["data-sources"],
    queryFn: () => employeeApiClient.get<PublicDataSource[]>("/data-sources"),
  });

  const latestJobQueries = useQueries({
    queries: (sources ?? []).map((source) => ({
      queryKey: ["sync-jobs", "latest", source.id],
      queryFn: () =>
        employeeApiClient.get<SyncJob[]>(`/sync-jobs?dataSourceId=${source.id}&limit=1`),
      enabled: sources !== undefined,
    })),
  });

  const latestJobBySourceId = new Map<string, SyncJob | undefined>(
    (sources ?? []).map((source, index) => [source.id, latestJobQueries[index]?.data?.[0]]),
  );

  const columns: ColumnDef<PublicDataSource>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Link to={`/app/data-sources/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
          <span className="text-xs text-muted-foreground">{row.original.systemType}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
          {row.original.status === "ERROR" && row.original.lastError ? (
            <span className="text-xs text-destructive">{row.original.lastError}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "lastSync",
      header: "Last sync",
      cell: ({ row }) => {
        const job = latestJobBySourceId.get(row.original.id);
        if (row.original.lastSyncAt) {
          return <DateTime value={row.original.lastSyncAt} />;
        }
        if (job) {
          return <DateTime value={job.startedAt} />;
        }
        return <span className="text-sm text-muted-foreground">Never synced</span>;
      },
    },
    {
      id: "recordCount",
      header: "Records (last sync)",
      cell: ({ row }) => {
        const job = latestJobBySourceId.get(row.original.id);
        return job ? (
          <span className="text-sm">{job.recordsRead.toLocaleString()}</span>
        ) : (
          <span className="text-sm text-muted-foreground">&mdash;</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <SyncNowButton dataSourceId={row.original.id} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Data Sources</h1>
          <p className="text-sm text-muted-foreground">
            Every connected system, its status, and its most recent sync.
          </p>
        </div>
        <PermissionGate permission="CAN_MANAGE_DATA_SOURCES">
          <Button asChild>
            <Link to="/app/data-sources/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New data source
            </Link>
          </Button>
        </PermissionGate>
      </div>

      <DataTable
        columns={columns}
        data={sources ?? []}
        isLoading={isLoading}
        getRowId={(source) => source.id}
        emptyState={{
          description:
            "No data sources are connected yet. Connecting one is the entry point to discovery -- schema, field mapping, and purposes all follow from it.",
          action: { label: "New data source", to: "/app/data-sources/new" },
        }}
      />
    </div>
  );
}
