import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

interface EmptyStateConfig {
  title?: string;
  description: string;
  /** Required -- spec line 872: every empty state carries a next action, not just an explanation. */
  action: { label: string; onClick: () => void } | { label: string; to: string };
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  /** True while the backing query is pending -- renders skeleton rows, never a spinner (spec line 872). */
  isLoading?: boolean;
  skeletonRows?: number;
  /** Shown instead of an empty table body -- must carry one line of explanation and a next action (spec line 872). */
  emptyState: EmptyStateConfig;
  getRowId?: (row: TData, index: number) => string;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  skeletonRows = 5,
  emptyState,
  getRowId,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRowId as ((row: TData, index: number) => string) | undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="data-table-skeleton">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState {...emptyState} />;
  }

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
