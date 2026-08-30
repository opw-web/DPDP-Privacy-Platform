import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { DataTable } from "../../../components/shared/DataTable";
import { DateTime } from "../../../components/shared/DateTime";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PermissionGate } from "../../../components/shared/PermissionGate";
import { FieldShell, SelectControl, TextareaControl, CheckboxOption } from "../form-controls";
import { NotReviewedChip } from "../NotReviewedChip";
import { DATA_CATEGORY_OPTIONS, humanizeEnum } from "../../lib/enum-options";

/** Mirrors `PublicSharingActivity` (sharing.service.ts) exactly. */
interface SharingActivity {
  id: string;
  recipientId: string;
  purposeId: string;
  dataCategories: string[];
  description: string;
  sourceIds: string[];
  startedAt: string;
  endedAt: string | null;
  active: boolean;
}

/** Just enough of `PublicRecipient` and `PublicPurpose` to join a name (and, for a purpose, its review state) onto a row. */
interface RecipientRef {
  id: string;
  name: string;
}
interface PurposeRef {
  id: string;
  name: string;
  isReviewed: boolean;
}

const sharingFormSchema = z.object({
  recipientId: z.string().trim().min(1, "Choose a recipient."),
  purposeId: z.string().trim().min(1, "Choose a purpose."),
  dataCategories: z.array(z.string()),
  description: z
    .string()
    .trim()
    .min(1, "Required -- s.11(1)(b) obliges the company to describe what personal data is shared."),
  sourceIds: z.string().trim(),
  startedAt: z.string().trim().min(1, "Started date is required."),
  endedAt: z.string().trim(),
  active: z.boolean(),
});

type SharingFormValues = z.infer<typeof sharingFormSchema>;

const DEFAULT_VALUES: SharingFormValues = {
  recipientId: "",
  purposeId: "",
  dataCategories: [],
  description: "",
  sourceIds: "",
  startedAt: "",
  endedAt: "",
  active: true,
};

interface CreateSharingPayload {
  recipientId: string;
  purposeId: string;
  dataCategories: string[];
  description: string;
  sourceIds: string[];
  startedAt: string;
  endedAt?: string;
  active?: boolean;
}

function SharingForm({
  recipients,
  purposes,
  onDone,
}: {
  recipients: RecipientRef[];
  purposes: PurposeRef[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SharingFormValues>({
    resolver: zodResolver(sharingFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const createActivity = useMutation({
    mutationFn: (payload: CreateSharingPayload) =>
      employeeApiClient.post("/registers/sharing", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registers", "sharing"] });
      toast.success("Sharing activity recorded.");
      onDone();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not record this sharing activity.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    const sourceIds = values.sourceIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    createActivity.mutate({
      recipientId: values.recipientId,
      purposeId: values.purposeId,
      dataCategories: values.dataCategories,
      description: values.description,
      sourceIds,
      startedAt: new Date(values.startedAt).toISOString(),
      endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      active: values.active,
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Recipient" htmlFor="sharing-recipient" error={errors.recipientId?.message}>
          <SelectControl id="sharing-recipient" defaultValue="" {...register("recipientId")}>
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
        <FieldShell label="Purpose" htmlFor="sharing-purpose" error={errors.purposeId?.message}>
          <SelectControl id="sharing-purpose" defaultValue="" {...register("purposeId")}>
            <option value="" disabled>
              Select a purpose&hellip;
            </option>
            {purposes.map((purpose) => (
              <option key={purpose.id} value={purpose.id}>
                {purpose.name}
                {purpose.isReviewed ? "" : " (not yet reviewed)"}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      <FieldShell
        label="Description of the personal data shared"
        htmlFor="sharing-description"
        error={errors.description?.message}
        hint={<p className="text-xs text-muted-foreground">s.11(1)(b): cannot be left blank.</p>}
      >
        <TextareaControl id="sharing-description" {...register("description")} />
      </FieldShell>

      <div className="space-y-1.5">
        <Label>Data categories shared</Label>
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
                    id={`sharing-category-${option.value}`}
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

      <FieldShell
        label="Data source IDs feeding this sharing (comma-separated, optional)"
        htmlFor="sharing-source-ids"
        hint={
          <p className="text-xs text-muted-foreground">
            Used to answer which recipients hold a given data principal&rsquo;s data.
          </p>
        }
      >
        <Input id="sharing-source-ids" {...register("sourceIds")} />
      </FieldShell>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Started" htmlFor="sharing-started" error={errors.startedAt?.message}>
          <Input id="sharing-started" type="date" {...register("startedAt")} />
        </FieldShell>
        <FieldShell label="Ended (optional)" htmlFor="sharing-ended">
          <Input id="sharing-ended" type="date" {...register("endedAt")} />
        </FieldShell>
      </div>

      <CheckboxOption id="sharing-active" label="Active" {...register("active")} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createActivity.isPending}>
          {createActivity.isPending ? "Saving..." : "Record sharing activity"}
        </Button>
      </div>
    </form>
  );
}

/** `/app/registers` -- "Sharing Activities" tab. */
export function SharingTab() {
  const [isCreating, setIsCreating] = useState(false);

  const { data: activities, isLoading } = useQuery({
    queryKey: ["registers", "sharing"],
    queryFn: () => employeeApiClient.get<SharingActivity[]>("/registers/sharing"),
  });
  const { data: recipients } = useQuery({
    queryKey: ["registers", "recipients"],
    queryFn: () => employeeApiClient.get<RecipientRef[]>("/registers/recipients"),
  });
  const { data: purposes } = useQuery({
    queryKey: ["purposes"],
    queryFn: () => employeeApiClient.get<PurposeRef[]>("/purposes"),
  });

  const recipientById = new Map((recipients ?? []).map((r) => [r.id, r]));
  const purposeById = new Map((purposes ?? []).map((p) => [p.id, p]));

  const columns: ColumnDef<SharingActivity>[] = [
    {
      id: "recipient",
      header: "Recipient",
      cell: ({ row }) =>
        recipientById.get(row.original.recipientId)?.name ?? row.original.recipientId,
    },
    {
      id: "purpose",
      header: "Purpose",
      cell: ({ row }) => {
        const purpose = purposeById.get(row.original.purposeId);
        return (
          <div className="flex items-center gap-2">
            <span>{purpose?.name ?? row.original.purposeId}</span>
            <NotReviewedChip isReviewed={purpose?.isReviewed ?? true} />
          </div>
        );
      },
    },
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
    { accessorKey: "description", header: "Description of data shared" },
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <span className="text-sm">
          <DateTime value={row.original.startedAt} />
          {row.original.endedAt ? (
            <>
              {" "}
              &ndash; <DateTime value={row.original.endedAt} />
            </>
          ) : null}
        </span>
      ),
    },
    {
      id: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "success" : "outline"}>
          {row.original.active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PermissionGate permission="CAN_MANAGE_REGISTERS">
          <Button onClick={() => setIsCreating((current) => !current)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New sharing activity
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New sharing activity</CardTitle>
          </CardHeader>
          <CardContent>
            <SharingForm
              recipients={recipients ?? []}
              purposes={purposes ?? []}
              onDone={() => setIsCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={activities ?? []}
        isLoading={isLoading}
        getRowId={(activity) => activity.id}
        emptyState={{
          description: "No sharing activity has been recorded with any recipient yet.",
          action: { label: "New sharing activity", onClick: () => setIsCreating(true) },
        }}
      />
    </div>
  );
}
