import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { DataTable } from "../../components/shared/DataTable";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type { SyncJob, SyncStatus } from "../lib/data-sources-api";

const STATUS_VARIANT: Record<SyncStatus, "default" | "secondary" | "destructive" | "success" | "amber"> = {
  QUEUED: "secondary",
  RUNNING: "default",
  SUCCESS: "success",
  PARTIAL: "amber",
  FAILED: "destructive",
};

function errorLogEntries(errorLog: unknown[]): string[] {
  return errorLog.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry)));
}

interface SyncHistoryTableProps {
  dataSourceId: string;
}

/**
 * The Sync History tab (and any other consumer of `GET /api/sync-jobs`):
 * every `SyncJob` counter the schema tracks -- `recordsRead`,
 * `recordsCreated`, `recordsUpdated`, `recordsSkipped`, `recordsFailed`,
 * `principalsCreated`, `principalsLinked`, `candidatesRaised` (8 columns
 * in the Prisma schema today; the task brief says "nine" -- flagged as a
 * concern in task-24-report.md, every counter the model actually has is
 * rendered here) -- plus the error log, expandable per row. Every
 * timestamp goes through `<DateTime>` (org timezone, UTC tooltip); never
 * formatted any other way.
 */
export function SyncHistoryTable({ dataSourceId }: SyncHistoryTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["sync-jobs", dataSourceId],
    queryFn: () =>
      employeeApiClient.get<SyncJob[]>(
        `/sync-jobs?dataSourceId=${encodeURIComponent(dataSourceId)}&limit=50`,
      ),
  });

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const columns: ColumnDef<SyncJob>[] = [
    {
      id: "expand",
      header: "",
      cell: ({ row }) =>
        errorLogEntries(row.original.errorLog).length > 0 ? (
          <Button variant="ghost" size="icon" onClick={() => toggle(row.original.id)}>
            {expanded.has(row.original.id) ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        ) : null,
    },
    {
      accessorKey: "startedAt",
      header: "Started",
      cell: ({ row }) => <DateTime value={row.original.startedAt} />,
    },
    {
      accessorKey: "finishedAt",
      header: "Finished",
      cell: ({ row }) =>
        row.original.finishedAt ? (
          <DateTime value={row.original.finishedAt} />
        ) : (
          <span className="text-sm text-muted-foreground">In progress</span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
      ),
    },
    { accessorKey: "triggeredBy", header: "Triggered by" },
    {
      id: "records",
      header: "Records",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div className="text-xs text-muted-foreground">
            <div>
              Read {job.recordsRead} &middot; Created {job.recordsCreated} &middot; Updated{" "}
              {job.recordsUpdated}
            </div>
            <div>
              Skipped {job.recordsSkipped} &middot; Failed {job.recordsFailed}
            </div>
          </div>
        );
      },
    },
    {
      id: "identity",
      header: "Identity resolution",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div className="text-xs text-muted-foreground">
            <div>
              Principals created {job.principalsCreated} &middot; linked {job.principalsLinked}
            </div>
            <div>Candidates raised {job.candidatesRaised}</div>
          </div>
        );
      },
    },
    {
      id: "errors",
      header: "Errors",
      cell: ({ row }) => {
        const entries = errorLogEntries(row.original.errorLog);
        return entries.length > 0 ? (
          <span className="text-xs text-destructive">{entries.length} error(s)</span>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        );
      },
    },
  ];

  const rows = jobs ?? [];

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        getRowId={(job) => job.id}
        emptyState={{
          description:
            "No sync has run for this source yet. Trigger one from the data sources list or wait for its schedule.",
          action: { label: "Go to data sources", to: "/app/data-sources" },
        }}
      />
      {rows
        .filter((job) => expanded.has(job.id) && errorLogEntries(job.errorLog).length > 0)
        .map((job) => (
          <div
            key={`${job.id}-errors`}
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <p className="mb-1 font-medium">
              Error log &middot; <DateTime value={job.startedAt} />
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {errorLogEntries(job.errorLog).map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
