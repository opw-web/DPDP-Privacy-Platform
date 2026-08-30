import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { DataTable } from "../../../components/shared/DataTable";
import type { PublicDataSourceField } from "../../lib/data-sources-api";

interface Step2SchemaProps {
  dataSourceId: string;
  /** Seeds the table when this step is revisited (e.g. going back from Step 3) without re-running discovery. */
  initialFields?: PublicDataSourceField[];
  onDiscovered: (fields: PublicDataSourceField[]) => void;
}

const columns: ColumnDef<PublicDataSourceField>[] = [
  { accessorKey: "fieldName", header: "Field name" },
  {
    accessorKey: "sampleValue",
    header: "Sample value",
    cell: ({ row }) =>
      row.original.sampleValue === null ? (
        <span className="text-sm text-muted-foreground">(no sample / scrubbed)</span>
      ) : (
        <span className="font-mono text-sm">{row.original.sampleValue}</span>
      ),
  },
  { accessorKey: "inferredType", header: "Inferred type" },
];

/**
 * Step ② of the wizard: a live, read-only discovery read against the
 * source (global constraint #1 -- the platform never writes to a
 * connected system). `POST /data-sources/:id/discover-schema` both
 * returns and persists the discovered `DataSourceField` rows; this step
 * shows exactly what it returns.
 */
export function Step2Schema({ dataSourceId, initialFields, onDiscovered }: Step2SchemaProps) {
  const [fields, setFields] = useState<PublicDataSourceField[]>(initialFields ?? []);

  const discover = useMutation({
    mutationFn: () =>
      employeeApiClient.post<PublicDataSourceField[]>(
        `/data-sources/${dataSourceId}/discover-schema`,
      ),
    onSuccess: (result) => {
      setFields(result);
      onDiscovered(result);
      toast.success(`Discovered ${result.length} field(s).`);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not discover the schema. Check the connection and try again.";
      toast.error(message);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Reads the source system once (read-only) and lists the fields it finds, with a sample
          value and inferred type for each.
        </p>
        <Button type="button" onClick={() => discover.mutate()} disabled={discover.isPending}>
          <RefreshCw className={discover.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          {fields.length > 0 ? "Re-discover schema" : "Discover schema"}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={fields}
        isLoading={discover.isPending && fields.length === 0}
        getRowId={(field) => field.id}
        emptyState={{
          description:
            "No fields discovered yet. Discovery reads the source once, read-only, and lists what it finds.",
          action: { label: "Discover schema", onClick: () => discover.mutate() },
        }}
      />
    </div>
  );
}
