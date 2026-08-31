import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { DataTable } from "../../../components/shared/DataTable";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { PermissionGate } from "../../../components/shared/PermissionGate";
import { FieldShell, SelectControl, TextareaControl, CheckboxOption } from "../form-controls";
import { NotReviewedChip } from "../NotReviewedChip";
import {
  RETENTION_LEGAL_BASIS_TYPE_OPTIONS,
  RETENTION_LEGAL_BASIS_TYPE_VALUES,
  RETENTION_TRIGGER_TYPE_OPTIONS,
  RETENTION_TRIGGER_TYPE_VALUES,
  RETENTION_UNIT_OPTIONS,
  RETENTION_UNIT_VALUES,
  humanizeEnum,
} from "../../lib/enum-options";

/** Mirrors `PublicRetentionPolicy` (retention.service.ts) exactly. */
interface RetentionPolicy {
  id: string;
  purposeId: string;
  name: string;
  triggerType: string;
  retentionValue: number;
  retentionUnit: string;
  legalBasisForRetention: string;
  legalBasisType: string;
  minimumRetentionValue: number;
  minimumRetentionUnit: string;
  preErasureNoticeHours: number;
  accountAccessCarveOut: boolean;
  active: boolean;
}

interface PurposeRef {
  id: string;
  name: string;
  isReviewed: boolean;
}

const retentionFormSchema = z.object({
  purposeId: z.string().trim().min(1, "Choose a purpose."),
  name: z.string().trim().min(1, "Name is required."),
  triggerType: z.enum(RETENTION_TRIGGER_TYPE_VALUES, {
    errorMap: () => ({ message: "Choose the retention trigger." }),
  }),
  retentionValue: z
    .string()
    .trim()
    .min(1, "Retention period is required.")
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 1, {
      message: "Enter a whole number of at least 1.",
    }),
  retentionUnit: z.enum(RETENTION_UNIT_VALUES, {
    errorMap: () => ({ message: "Choose a unit." }),
  }),
  legalBasisForRetention: z.string().trim().min(1, "Cite the statute, sectoral rule, or company policy."),
  legalBasisType: z.enum(RETENTION_LEGAL_BASIS_TYPE_VALUES, {
    errorMap: () => ({ message: "Choose a legal basis type." }),
  }),
  accountAccessCarveOut: z.boolean(),
  active: z.boolean(),
});

type RetentionFormValues = z.infer<typeof retentionFormSchema>;

const DEFAULT_VALUES = {
  purposeId: "",
  name: "",
  retentionValue: "",
  legalBasisForRetention: "",
  accountAccessCarveOut: false,
  active: true,
};

interface CreateRetentionPayload {
  purposeId: string;
  name: string;
  triggerType: string;
  retentionValue: number;
  retentionUnit: string;
  legalBasisForRetention: string;
  legalBasisType: string;
  accountAccessCarveOut?: boolean;
  active?: boolean;
}

function RetentionForm({ purposes, onDone }: { purposes: PurposeRef[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RetentionFormValues>({
    resolver: zodResolver(retentionFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const createPolicy = useMutation({
    mutationFn: (payload: CreateRetentionPayload) =>
      employeeApiClient.post("/registers/retention", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registers", "retention"] });
      toast.success("Retention policy created.");
      onDone();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(error.message || "A retention policy with this name already exists for this purpose.");
        return;
      }
      const message =
        error instanceof ApiError && error.message ? error.message : "Could not create this retention policy.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    createPolicy.mutate({
      purposeId: values.purposeId,
      name: values.name,
      triggerType: values.triggerType,
      retentionValue: Number(values.retentionValue),
      retentionUnit: values.retentionUnit,
      legalBasisForRetention: values.legalBasisForRetention,
      legalBasisType: values.legalBasisType,
      accountAccessCarveOut: values.accountAccessCarveOut,
      active: values.active,
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Purpose" htmlFor="retention-purpose" error={errors.purposeId?.message}>
          <SelectControl id="retention-purpose" defaultValue="" {...register("purposeId")}>
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
        <FieldShell label="Policy name" htmlFor="retention-name" error={errors.name?.message}>
          <Input id="retention-name" {...register("name")} />
        </FieldShell>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FieldShell label="Trigger" htmlFor="retention-trigger" error={errors.triggerType?.message}>
          <SelectControl id="retention-trigger" defaultValue="" {...register("triggerType")}>
            <option value="" disabled>
              Select&hellip;
            </option>
            {RETENTION_TRIGGER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
        <FieldShell label="Retention period" htmlFor="retention-value" error={errors.retentionValue?.message}>
          <Input id="retention-value" type="number" min={1} step={1} {...register("retentionValue")} />
        </FieldShell>
        <FieldShell label="Unit" htmlFor="retention-unit" error={errors.retentionUnit?.message}>
          <SelectControl id="retention-unit" defaultValue="" {...register("retentionUnit")}>
            <option value="" disabled>
              Select&hellip;
            </option>
            {RETENTION_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell
          label="Legal basis citation"
          htmlFor="retention-legal-basis"
          error={errors.legalBasisForRetention?.message}
        >
          <TextareaControl id="retention-legal-basis" {...register("legalBasisForRetention")} />
        </FieldShell>
        <FieldShell
          label="Legal basis type"
          htmlFor="retention-legal-basis-type"
          error={errors.legalBasisType?.message}
        >
          <SelectControl id="retention-legal-basis-type" defaultValue="" {...register("legalBasisType")}>
            <option value="" disabled>
              Select&hellip;
            </option>
            {RETENTION_LEGAL_BASIS_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      <CheckboxOption
        id="retention-carve-out"
        label="Third Schedule account-access carve-out applies (RE-04)"
        {...register("accountAccessCarveOut")}
      />
      <CheckboxOption id="retention-active" label="Active" {...register("active")} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createPolicy.isPending}>
          {createPolicy.isPending ? "Creating..." : "Create policy"}
        </Button>
      </div>
    </form>
  );
}

/** `/app/registers` -- "Retention Policies" tab. Every period rendered comes from the API; none is a literal in this file (global constraint #4). */
export function RetentionTab() {
  const [isCreating, setIsCreating] = useState(false);

  const { data: policies, isLoading } = useQuery({
    queryKey: ["registers", "retention"],
    queryFn: () => employeeApiClient.get<RetentionPolicy[]>("/registers/retention"),
  });
  const { data: purposes } = useQuery({
    queryKey: ["purposes"],
    queryFn: () => employeeApiClient.get<PurposeRef[]>("/purposes"),
  });

  const purposeById = new Map((purposes ?? []).map((p) => [p.id, p]));

  const columns: ColumnDef<RetentionPolicy>[] = [
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
    { accessorKey: "name", header: "Policy" },
    {
      id: "trigger",
      header: "Trigger",
      cell: ({ row }) => humanizeEnum(row.original.triggerType),
    },
    {
      id: "period",
      header: "Retention period",
      cell: ({ row }) => `${row.original.retentionValue} ${humanizeEnum(row.original.retentionUnit)}`,
    },
    {
      id: "minimum",
      header: "Minimum (Rule 8(3))",
      cell: ({ row }) =>
        `${row.original.minimumRetentionValue} ${humanizeEnum(row.original.minimumRetentionUnit)}`,
    },
    {
      id: "legalBasis",
      header: "Legal basis",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm">{row.original.legalBasisForRetention}</span>
          <span className="text-xs text-muted-foreground">
            {humanizeEnum(row.original.legalBasisType)}
          </span>
        </div>
      ),
    },
    {
      id: "carveOut",
      header: "Account-access carve-out",
      cell: ({ row }) =>
        row.original.accountAccessCarveOut ? (
          <Badge variant="secondary">Applies (RE-04)</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">No</span>
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
            New retention policy
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New retention policy</CardTitle>
          </CardHeader>
          <CardContent>
            <RetentionForm purposes={purposes ?? []} onDone={() => setIsCreating(false)} />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={policies ?? []}
        isLoading={isLoading}
        getRowId={(policy) => policy.id}
        emptyState={{
          description: "No retention policy has been declared for any purpose yet.",
          action: { label: "New retention policy", onClick: () => setIsCreating(true) },
        }}
      />
    </div>
  );
}
