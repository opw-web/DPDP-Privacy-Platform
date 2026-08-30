import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { DataTable } from "../../components/shared/DataTable";
import { DateTime } from "../../components/shared/DateTime";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { LineageChip, type SourceRef } from "../components/LineageChip";
import { humanizeEnum } from "../lib/enum-options";

type AgeStatus = "UNKNOWN" | "ADULT" | "CHILD" | "GUARDIAN_REPRESENTED";

const AGE_STATUS_OPTIONS: readonly AgeStatus[] = [
  "UNKNOWN",
  "ADULT",
  "CHILD",
  "GUARDIAN_REPRESENTED",
];

/** Mirrors `PrincipalListItem` (`principals.service.ts`) exactly -- the shape `GET /api/principals` returns. */
export interface PrincipalListItem {
  id: string;
  reference: string;
  ageStatus: AgeStatus;
  createdAt: string;
  /** Null exactly when no attributable FULL_NAME field resolved (Check 8) -- never a guessed name. */
  displayName: string | null;
  sources: readonly SourceRef[];
}

interface PrincipalListResponse {
  items: PrincipalListItem[];
  page: number;
  pageSize: number;
}

/**
 * The ONE place an age status becomes a colour on this page -- mirrors
 * `signalBadgeVariant` in `CandidateComparison.tsx`: a single function every
 * call site uses, so the mapping cannot drift into a per-row special case.
 * CHILD renders amber to draw the eye toward CH-01 (s.9) obligations; this
 * is a visual cue only, never a claim that anything has or hasn't been done
 * about it.
 */
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

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * `/app/principals` (spec line 855): a searchable table over name, email,
 * phone and customer id -- the search box hits `GET /api/principals?q=`,
 * which searches all four server side (`principal-search-query.ts`); this
 * page never re-implements that matching client side. Every row's "Sources"
 * column is the resolved lineage of the DISPLAYED NAME ONLY (the list
 * endpoint's one attributable value) via `LineageChip`, which itself
 * renders nothing for a principal with no attributable name -- there is no
 * separate "unattributed" placeholder value to accidentally render.
 */
export function PrincipalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const ageStatusParam = searchParams.get("ageStatus");
  const initialAgeStatus: AgeStatus | "" =
    ageStatusParam !== null && AGE_STATUS_OPTIONS.includes(ageStatusParam as AgeStatus)
      ? (ageStatusParam as AgeStatus)
      : "";
  const initialPage = Number(searchParams.get("page") ?? "1") || 1;

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [ageStatus, setAgeStatus] = useState<AgeStatus | "">(initialAgeStatus);
  const [page, setPage] = useState(initialPage);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedQuery.trim().length > 0) next.set("q", debouncedQuery.trim());
    if (ageStatus) next.set("ageStatus", ageStatus);
    if (page !== 1) next.set("page", String(page));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, ageStatus, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["principals", { q: debouncedQuery.trim(), ageStatus, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQuery.trim().length > 0) params.set("q", debouncedQuery.trim());
      if (ageStatus) params.set("ageStatus", ageStatus);
      params.set("page", String(page));
      return employeeApiClient.get<PrincipalListResponse>(`/principals?${params.toString()}`);
    },
  });

  const items = data?.items ?? [];
  const hasFilters = debouncedQuery.trim().length > 0 || ageStatus !== "";

  const columns: ColumnDef<PrincipalListItem>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to={`/app/principals/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.original.displayName ?? `Principal ${row.original.reference}`}
        </Link>
      ),
    },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.reference}</span>
      ),
    },
    {
      id: "sources",
      header: "Sources",
      cell: ({ row }) => <LineageChip sources={row.original.sources} />,
    },
    {
      id: "ageStatus",
      header: "Age status",
      cell: ({ row }) => (
        <Badge variant={ageStatusVariant(row.original.ageStatus)}>
          {humanizeEnum(row.original.ageStatus)}
        </Badge>
      ),
    },
    {
      id: "createdAt",
      header: "First seen",
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Principals</h1>
        <p className="text-sm text-muted-foreground">
          Every data principal assembled from your connected systems, searchable by name, email,
          phone or customer ID.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(event) => {
              setQueryInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone or customer ID"
            className="pl-8"
            aria-label="Search principals"
          />
        </div>
        <select
          value={ageStatus}
          onChange={(event) => {
            setAgeStatus(event.target.value as AgeStatus | "");
            setPage(1);
          }}
          aria-label="Filter by age status"
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All age statuses</option>
          {AGE_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {humanizeEnum(status)}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        emptyState={
          hasFilters
            ? {
                title: "No principals matched",
                description: "No principal matches this search or age-status filter.",
                action: {
                  label: "Clear filters",
                  onClick: () => {
                    setQueryInput("");
                    setAgeStatus("");
                    setPage(1);
                  },
                },
              }
            : {
                title: "No principals yet",
                description:
                  "No data principal has been assembled yet. Connect and sync a data source to populate this list.",
                action: { label: "Go to data sources", to: "/app/data-sources" },
              }
        }
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={items.length < (data?.pageSize ?? 25)}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
