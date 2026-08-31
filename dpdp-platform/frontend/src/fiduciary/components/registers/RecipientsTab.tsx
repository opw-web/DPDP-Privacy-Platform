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
import { FieldShell, SelectControl, CheckboxOption } from "../form-controls";
import { RECIPIENT_TYPE_OPTIONS, RECIPIENT_TYPE_VALUES, humanizeEnum } from "../../lib/enum-options";

/** Mirrors `PublicRecipient` (recipients.service.ts) exactly. */
interface Recipient {
  id: string;
  name: string;
  type: "DATA_PROCESSOR" | "OTHER_DATA_FIDUCIARY";
  contactEmail: string | null;
  country: string;
  contractExists: boolean;
  contractReference: string | null;
  contractSignedAt: string | null;
  contractExpiresAt: string | null;
  contractHasSecurityClause: boolean;
  contractHasErasureClause: boolean;
  contractHasAuditRights: boolean;
  subProcessorsDisclosed: boolean;
  subProcessorNotes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The exact same s.8(2) wording `RecipientsService.assertProcessorRule()`
 * throws server-side, transcribed verbatim -- so the client-side block
 * and the server's 400 (if this is ever bypassed) read identically.
 */
const PROCESSOR_CONTRACT_MESSAGE =
  "A DATA_PROCESSOR recipient cannot be active without a valid contract on file (contractExists must be true) -- s.8(2).";

const recipientFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    type: z.enum(RECIPIENT_TYPE_VALUES, {
      errorMap: () => ({ message: "Choose a recipient type." }),
    }),
    contactEmail: z.union([z.string().trim().email("Enter a valid email address."), z.literal("")]),
    country: z.string().trim(),
    contractExists: z.boolean(),
    contractReference: z.string().trim(),
    active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "DATA_PROCESSOR" && values.active && !values.contractExists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contractExists"],
        message: PROCESSOR_CONTRACT_MESSAGE,
      });
    }
  });

type RecipientFormValues = z.infer<typeof recipientFormSchema>;

const DEFAULT_VALUES = {
  name: "",
  contactEmail: "",
  country: "",
  contractExists: false,
  contractReference: "",
  active: true,
};

interface CreateRecipientPayload {
  name: string;
  type: string;
  contactEmail?: string;
  country?: string;
  contractExists?: boolean;
  contractReference?: string;
  active?: boolean;
}

function RecipientForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RecipientFormValues>({
    resolver: zodResolver(recipientFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const type = watch("type");
  const active = watch("active");
  const contractExists = watch("contractExists");

  const createRecipient = useMutation({
    mutationFn: (payload: CreateRecipientPayload) =>
      employeeApiClient.post("/registers/recipients", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registers", "recipients"] });
      toast.success("Recipient created.");
      onDone();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("A recipient with this name already exists in this organization.");
        return;
      }
      // Reached if the client-side s.8(2) check above is ever bypassed --
      // the server's 400 is surfaced verbatim, not swallowed.
      const message =
        error instanceof ApiError && error.message ? error.message : "Could not create this recipient.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    const payload: CreateRecipientPayload = {
      name: values.name,
      type: values.type,
      active: values.active,
      contractExists: values.contractExists,
      contactEmail: values.contactEmail || undefined,
      country: values.country || undefined,
      contractReference: values.contractReference || undefined,
    };
    createRecipient.mutate(payload);
  });

  const showsProcessorWarning = type === "DATA_PROCESSOR" && active && !contractExists;

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Name" htmlFor="recipient-name" error={errors.name?.message}>
          <Input id="recipient-name" {...register("name")} />
        </FieldShell>
        <FieldShell label="Type" htmlFor="recipient-type" error={errors.type?.message}>
          <SelectControl id="recipient-type" defaultValue="" {...register("type")}>
            <option value="" disabled>
              Select a type&hellip;
            </option>
            {RECIPIENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Contact email (optional)" htmlFor="recipient-email" error={errors.contactEmail?.message}>
          <Input id="recipient-email" type="email" {...register("contactEmail")} />
        </FieldShell>
        <FieldShell label="Country (optional, default IN)" htmlFor="recipient-country">
          <Input id="recipient-country" placeholder="IN" {...register("country")} />
        </FieldShell>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <CheckboxOption id="recipient-contract-exists" label="A valid contract is on file" {...register("contractExists")} />
        <FieldShell label="Contract reference (optional)" htmlFor="recipient-contract-reference">
          <Input id="recipient-contract-reference" {...register("contractReference")} />
        </FieldShell>
        <CheckboxOption id="recipient-active" label="Active (currently engaged)" {...register("active")} />
      </div>

      {showsProcessorWarning ? (
        <p className="text-sm text-destructive" role="alert">
          {PROCESSOR_CONTRACT_MESSAGE}
        </p>
      ) : null}
      {errors.contractExists?.message && !showsProcessorWarning ? (
        <p className="text-sm text-destructive">{errors.contractExists.message}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createRecipient.isPending}>
          {createRecipient.isPending ? "Creating..." : "Create recipient"}
        </Button>
      </div>
    </form>
  );
}

function ContractStatusCell({ recipient }: { recipient: Recipient }) {
  if (recipient.type !== "DATA_PROCESSOR") {
    return <span className="text-sm text-muted-foreground">Not required (s.8(2) applies to processors)</span>;
  }
  return recipient.contractExists ? (
    <Badge variant="success">Contract on file</Badge>
  ) : (
    <Badge variant="destructive">No contract (s.8(2))</Badge>
  );
}

/** `/app/registers` -- "Processors & Recipients" tab. */
export function RecipientsTab() {
  const [isCreating, setIsCreating] = useState(false);

  const { data: recipients, isLoading } = useQuery({
    queryKey: ["registers", "recipients"],
    queryFn: () => employeeApiClient.get<Recipient[]>("/registers/recipients"),
  });

  const columns: ColumnDef<Recipient>[] = [
    { accessorKey: "name", header: "Name" },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => humanizeEnum(row.original.type),
    },
    { accessorKey: "country", header: "Country" },
    {
      id: "contract",
      header: "Contract",
      cell: ({ row }) => <ContractStatusCell recipient={row.original} />,
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
            New recipient
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New recipient</CardTitle>
          </CardHeader>
          <CardContent>
            <RecipientForm onDone={() => setIsCreating(false)} />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={recipients ?? []}
        isLoading={isLoading}
        getRowId={(recipient) => recipient.id}
        emptyState={{
          description: "No processors or recipients have been recorded yet.",
          action: { label: "New recipient", onClick: () => setIsCreating(true) },
        }}
      />
    </div>
  );
}
