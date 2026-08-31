import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { DateTime } from "../../../components/shared/DateTime";
import { EmptyState } from "../../../components/shared/EmptyState";
import { Skeleton } from "../../../components/shared/Skeleton";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { PermissionGate } from "../../../components/shared/PermissionGate";
import { FieldShell, SelectControl, TextareaControl, CheckboxOption } from "../form-controls";
import {
  SECURITY_MEASURE_TYPE_OPTIONS,
  SECURITY_MEASURE_TYPE_VALUES,
  SECURITY_RULE_REFERENCE_OPTIONS,
  SECURITY_RULE_REFERENCE_VALUES,
  humanizeEnum,
} from "../../lib/enum-options";

/** Mirrors `PublicSecurityMeasure` (security-measures.service.ts) exactly. */
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

/** Mirrors `SecurityMeasureGroup` (security-measures.service.ts) exactly -- the server groups by rule reference, this tab does not re-derive the grouping. */
interface SecurityMeasureGroup {
  ruleReference: string;
  totalCount: number;
  implementedCount: number;
  measures: SecurityMeasure[];
}

const securityFormSchema = z.object({
  dataSourceId: z.string().trim(),
  ruleReference: z.enum(SECURITY_RULE_REFERENCE_VALUES, {
    errorMap: () => ({ message: "Choose the Rule 6(1) clause this measure addresses." }),
  }),
  measureType: z.enum(SECURITY_MEASURE_TYPE_VALUES, {
    errorMap: () => ({ message: "Choose a measure type." }),
  }),
  implemented: z.boolean(),
  description: z.string().trim().min(1, "Describe this measure."),
  evidenceReference: z.string().trim(),
});

type SecurityFormValues = z.infer<typeof securityFormSchema>;

const DEFAULT_VALUES = {
  dataSourceId: "",
  implemented: false,
  description: "",
  evidenceReference: "",
};

interface CreateSecurityMeasurePayload {
  dataSourceId?: string;
  ruleReference: string;
  measureType: string;
  implemented?: boolean;
  description: string;
  evidenceReference?: string;
}

function SecurityMeasureForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SecurityFormValues>({
    resolver: zodResolver(securityFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const createMeasure = useMutation({
    mutationFn: (payload: CreateSecurityMeasurePayload) =>
      employeeApiClient.post("/registers/security", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["registers", "security"] });
      toast.success("Security measure recorded.");
      onDone();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message ? error.message : "Could not record this measure.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    createMeasure.mutate({
      dataSourceId: values.dataSourceId || undefined,
      ruleReference: values.ruleReference,
      measureType: values.measureType,
      implemented: values.implemented,
      description: values.description,
      evidenceReference: values.evidenceReference || undefined,
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Rule 6(1) clause" htmlFor="security-rule" error={errors.ruleReference?.message}>
          <SelectControl id="security-rule" defaultValue="" {...register("ruleReference")}>
            <option value="" disabled>
              Select&hellip;
            </option>
            {SECURITY_RULE_REFERENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
        <FieldShell label="Measure type" htmlFor="security-type" error={errors.measureType?.message}>
          <SelectControl id="security-type" defaultValue="" {...register("measureType")}>
            <option value="" disabled>
              Select&hellip;
            </option>
            {SECURITY_MEASURE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      <FieldShell label="Description" htmlFor="security-description" error={errors.description?.message}>
        <TextareaControl id="security-description" {...register("description")} />
      </FieldShell>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell
          label="Data source ID (optional -- leave blank for an organization-wide measure)"
          htmlFor="security-data-source"
        >
          <Input id="security-data-source" {...register("dataSourceId")} />
        </FieldShell>
        <FieldShell label="Evidence reference (optional)" htmlFor="security-evidence">
          <Input id="security-evidence" {...register("evidenceReference")} />
        </FieldShell>
      </div>

      <CheckboxOption id="security-implemented" label="Implemented" {...register("implemented")} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={createMeasure.isPending}>
          {createMeasure.isPending ? "Saving..." : "Record measure"}
        </Button>
      </div>
    </form>
  );
}

function RuleGroupCard({ group }: { group: SecurityMeasureGroup }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{group.ruleReference}</CardTitle>
        <Badge variant={group.implementedCount === group.totalCount ? "success" : "secondary"}>
          {group.implementedCount} / {group.totalCount} implemented
        </Badge>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Last reviewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.measures.map((measure) => (
              <TableRow key={measure.id}>
                <TableCell>{humanizeEnum(measure.measureType)}</TableCell>
                <TableCell>{measure.description}</TableCell>
                <TableCell>
                  {measure.implemented ? (
                    <Badge variant="success">Implemented</Badge>
                  ) : (
                    <Badge variant="destructive">Not implemented</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {measure.evidenceReference ?? (
                    <span className="text-sm text-muted-foreground">None on file</span>
                  )}
                </TableCell>
                <TableCell>
                  {measure.lastReviewedAt ? (
                    <DateTime value={measure.lastReviewedAt} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Never</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * `/app/registers` -- "Security Measures" tab. `SecurityMeasuresService.list()`
 * already returns `SecurityMeasureGroup[]` grouped by Rule 6(1) clause with
 * implemented counts (task brief) -- this tab renders that shape directly
 * rather than re-deriving the grouping client-side.
 */
export function SecurityMeasuresTab() {
  const [isCreating, setIsCreating] = useState(false);

  const { data: groups, isLoading } = useQuery({
    queryKey: ["registers", "security"],
    queryFn: () => employeeApiClient.get<SecurityMeasureGroup[]>("/registers/security"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PermissionGate permission="CAN_MANAGE_REGISTERS">
          <Button onClick={() => setIsCreating((current) => !current)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New security measure
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New security measure</CardTitle>
          </CardHeader>
          <CardContent>
            <SecurityMeasureForm onDone={() => setIsCreating(false)} />
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-2" data-testid="security-measures-skeleton">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          description="No security measure has been recorded for any Rule 6(1) clause yet."
          action={{ label: "New security measure", onClick: () => setIsCreating(true) }}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <RuleGroupCard key={group.ruleReference} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
