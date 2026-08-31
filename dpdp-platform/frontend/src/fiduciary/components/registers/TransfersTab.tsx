import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { useEmployeeAuth } from "../../../lib/auth";
import { DataTable } from "../../../components/shared/DataTable";
import { DateTime } from "../../../components/shared/DateTime";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PermissionGate } from "../../../components/shared/PermissionGate";
import { FieldShell, SelectControl, TextareaControl, CheckboxOption } from "../form-controls";
import { DATA_CATEGORY_OPTIONS, humanizeEnum } from "../../lib/enum-options";

/**
 * Mirrors `PublicTransfer` (transfers.service.ts) exactly. This register
 * records what a human checked and when -- it never carries a "lawful" or
 * "approved" field, because there is no such field on the backend model.
 * Do not invent one here: the platform never concludes a transfer is
 * lawful (task brief, global constraint #8).
 */
interface Transfer {
  id: string;
  recipientId: string;
  destinationCountry: string;
  dataCategories: string[];
  purposeDescription: string;
  govtRestrictionChecked: boolean;
  govtRestrictionNotes: string | null;
  sectoralRestrictionNotes: string | null;
  localisationRequired: boolean;
  reviewedByEmployeeId: string | null;
  reviewedAt: string | null;
}

interface RecipientRef {
  id: string;
  name: string;
}

const transferFormSchema = z.object({
  recipientId: z.string().trim().min(1, "Choose a recipient."),
  destinationCountry: z.string().trim().min(1, "Destination country is required."),
  dataCategories: z.array(z.string()),
  purposeDescription: z.string().trim().min(1, "Describe the purpose of this transfer."),
  govtRestrictionChecked: z.boolean(),
  govtRestrictionNotes: z.string().trim(),
  sectoralRestrictionNotes: z.string().trim(),
  localisationRequired: z.boolean(),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

const DEFAULT_VALUES: TransferFormValues = {
  recipientId: "",
  destinationCountry: "",
  dataCategories: [],
  purposeDescription: "",
  govtRestrictionChecked: false,
  govtRestrictionNotes: "",
  sectoralRestrictionNotes: "",
  localisationRequired: false,
};

interface CreateTransferPayload {
  recipientId: string;
  destinationCountry: string;
  dataCategories: string[];
  purposeDescription: string;
  govtRestrictionChecked: boolean;
  govtRestrictionNotes?: string;
  sectoralRestrictionNotes?: string;
  localisationRequired: boolean;
  reviewedByEmployeeId?: string;
  reviewedAt?: string;
}

function TransferForm({ recipients, onDone }: { recipients: RecipientRef[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { employee } = useEmployeeAuth();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const createTransfer = useMutation({
    mutationFn: (payload: CreateTransferPayload) =>
      employeeApiClient.post("/registers/transfers", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registers", "transfers"] });
      toast.success("Transfer record saved.");
      onDone();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message ? error.message : "Could not save this transfer record.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    createTransfer.mutate({
      recipientId: values.recipientId,
      destinationCountry: values.destinationCountry,
      dataCategories: values.dataCategories,
      purposeDescription: values.purposeDescription,
      govtRestrictionChecked: values.govtRestrictionChecked,
      govtRestrictionNotes: values.govtRestrictionNotes || undefined,
      sectoralRestrictionNotes: values.sectoralRestrictionNotes || undefined,
      localisationRequired: values.localisationRequired,
      // Recorded as a fact -- "this employee entered this record, at this
      // time" -- never as an assertion that the transfer is lawful.
      reviewedByEmployeeId: employee?.id,
      reviewedAt: new Date().toISOString(),
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div
        className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        role="note"
      >
        This form records what has been checked for this transfer. It does not determine, and
        cannot be used to determine, whether the transfer is lawful -- that determination is the
        organization&rsquo;s own, made outside this platform.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Recipient" htmlFor="transfer-recipient" error={errors.recipientId?.message}>
          <SelectControl id="transfer-recipient" defaultValue="" {...register("recipientId")}>
            <option value="" disabled>
              Select a recipient&hellip;
            </option>
            {recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.name}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
        <FieldShell
          label="Destination country"
          htmlFor="transfer-country"
          error={errors.destinationCountry?.message}
        >
          <Input id="transfer-country" placeholder="e.g. US" {...register("destinationCountry")} />
        </FieldShell>
      </div>

      <FieldShell
        label="Purpose of this transfer"
        htmlFor="transfer-purpose"
        error={errors.purposeDescription?.message}
      >
        <TextareaControl id="transfer-purpose" {...register("purposeDescription")} />
      </FieldShell>

      <div className="space-y-1.5">
        <Label>Data categories transferred</Label>
        <Controller
          name="dataCategories"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-md border border-border p-3">
              {DATA_CATEGORY_OPTIONS.map((option) => {
                const checked = field.value.includes(option.value);
                return (
                  <CheckboxOption
                    key={option.value}
                    id={`transfer-category-${option.value}`}
                    label={option.label}
                    checked={checked}
                    onChange={(event) => {
                      field.onChange(
                        event.target.checked
                          ? [...field.value, option.value]
                          : field.value.filter((value) => value !== option.value),
                      );
                    }}
                  />
                );
              })}
            </div>
          )}
        />
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <CheckboxOption
          id="transfer-govt-checked"
          label="I have checked applicable government transfer restrictions (s.16 / Rule 15)"
          {...register("govtRestrictionChecked")}
        />
        <FieldShell label="Government restriction notes (optional)" htmlFor="transfer-govt-notes">
          <TextareaControl id="transfer-govt-notes" {...register("govtRestrictionNotes")} />
        </FieldShell>
        <FieldShell
          label="Sectoral restriction notes -- RBI / SEBI / IRDAI etc. (CB-02, optional)"
          htmlFor="transfer-sectoral-notes"
        >
          <TextareaControl id="transfer-sectoral-notes" {...register("sectoralRestrictionNotes")} />
        </FieldShell>
        <CheckboxOption
          id="transfer-localisation"
          label="Data localisation is required for this transfer (CB-03 / Rule 13(4))"
          {...register("localisationRequired")}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createTransfer.isPending}>
          {createTransfer.isPending ? "Saving..." : "Save transfer record"}
        </Button>
      </div>
    </form>
  );
}

function RestrictionCell({ transfer }: { transfer: Transfer }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>
        {transfer.govtRestrictionChecked ? (
          <Badge variant="secondary">Govt. restrictions checked</Badge>
        ) : (
          <Badge variant="outline">Not yet checked</Badge>
        )}
      </span>
      {transfer.sectoralRestrictionNotes ? (
        <span className="text-xs text-muted-foreground">{transfer.sectoralRestrictionNotes}</span>
      ) : null}
    </div>
  );
}

/**
 * `/app/registers` -- "Cross-Border Transfers" tab. No column, badge, or
 * heading here asserts a transfer IS lawful -- only what was checked, by
 * whom, and when.
 */
export function TransfersTab() {
  const [isCreating, setIsCreating] = useState(false);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["registers", "transfers"],
    queryFn: () => employeeApiClient.get<Transfer[]>("/registers/transfers"),
  });
  const { data: recipients } = useQuery({
    queryKey: ["registers", "recipients"],
    queryFn: () => employeeApiClient.get<RecipientRef[]>("/registers/recipients"),
  });

  const recipientById = new Map((recipients ?? []).map((r) => [r.id, r]));

  const columns: ColumnDef<Transfer>[] = [
    {
      id: "recipient",
      header: "Recipient",
      cell: ({ row }) => recipientById.get(row.original.recipientId)?.name ?? row.original.recipientId,
    },
    { accessorKey: "destinationCountry", header: "Destination country" },
    {
      id: "dataCategories",
      header: "Data categories",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.dataCategories.map((category) => (
            <Badge key={category} variant="secondary">
              {humanizeEnum(category)}
            </Badge>
          ))}
        </div>
      ),
    },
    { accessorKey: "purposeDescription", header: "Purpose" },
    {
      id: "restrictions",
      header: "Restrictions checked",
      cell: ({ row }) => <RestrictionCell transfer={row.original} />,
    },
    {
      id: "localisation",
      header: "Localisation",
      cell: ({ row }) =>
        row.original.localisationRequired ? (
          <Badge variant="secondary">Required</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">Not required</span>
        ),
    },
    {
      id: "reviewed",
      header: "Recorded",
      cell: ({ row }) =>
        row.original.reviewedAt ? (
          <DateTime value={row.original.reviewedAt} />
        ) : (
          <span className="text-sm text-muted-foreground">Not recorded</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PermissionGate permission="CAN_MANAGE_REGISTERS">
          <Button onClick={() => setIsCreating((current) => !current)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New transfer record
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New cross-border transfer record</CardTitle>
          </CardHeader>
          <CardContent>
            <TransferForm recipients={recipients ?? []} onDone={() => setIsCreating(false)} />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={transfers ?? []}
        isLoading={isLoading}
        getRowId={(transfer) => transfer.id}
        emptyState={{
          description: "No cross-border transfer has been recorded yet.",
          action: { label: "New transfer record", onClick: () => setIsCreating(true) },
        }}
      />
    </div>
  );
}
