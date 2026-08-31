import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { FieldShell, CheckboxOption, TextareaControl } from "../form-controls";
import type { PublicDataSource } from "../../lib/data-sources-api";

/**
 * SC-03: a human legal determination this platform records, never
 * concludes on its own -- mirrors `DataSourcesService.assertPubliclyAvailableJustified`
 * (backend, same rule, same wording) exactly. `justification` is required
 * and must be non-blank whenever `containsOnlyPubliclyAvailableData` is
 * true -- enforced here by the zod schema's own `superRefine`, not by a
 * disabled submit button alone (task brief's hardest-attacked
 * requirement): an attempted submit with the flag on and a blank/whitespace
 * justification fails validation and never reaches the network.
 */
const declarationsSchema = z
  .object({
    hostingCountry: z.string().trim().min(1, "Hosting country is required."),
    containsOnlyPubliclyAvailableData: z.boolean(),
    publiclyAvailableJustification: z.string(),
  })
  .superRefine((values, ctx) => {
    if (
      values.containsOnlyPubliclyAvailableData &&
      values.publiclyAvailableJustification.trim().length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publiclyAvailableJustification"],
        message:
          "Required when this source holds only publicly-available data (SC-03): explain, in " +
          "your own words, why -- this platform records the determination, it never makes it.",
      });
    }
  });

type DeclarationsFormValues = z.infer<typeof declarationsSchema>;

interface Step5DeclarationsProps {
  dataSourceId: string;
  initial?: Pick<
    PublicDataSource,
    "hostingCountry" | "containsOnlyPubliclyAvailableData" | "publiclyAvailableJustification"
  >;
  onSaved: (dataSource: PublicDataSource) => void;
}

export function Step5Declarations({ dataSourceId, initial, onSaved }: Step5DeclarationsProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DeclarationsFormValues>({
    resolver: zodResolver(declarationsSchema),
    defaultValues: {
      hostingCountry: initial?.hostingCountry ?? "IN",
      containsOnlyPubliclyAvailableData: initial?.containsOnlyPubliclyAvailableData ?? false,
      publiclyAvailableJustification: initial?.publiclyAvailableJustification ?? "",
    },
  });
  const containsOnlyPubliclyAvailableData = watch("containsOnlyPubliclyAvailableData");

  const save = useMutation({
    mutationFn: (values: DeclarationsFormValues) =>
      employeeApiClient.patch<PublicDataSource>(`/data-sources/${dataSourceId}`, {
        hostingCountry: values.hostingCountry,
        containsOnlyPubliclyAvailableData: values.containsOnlyPubliclyAvailableData,
        publiclyAvailableJustification: values.containsOnlyPubliclyAvailableData
          ? values.publiclyAvailableJustification
          : values.publiclyAvailableJustification || undefined,
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["data-source", dataSourceId] });
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success("Declarations saved.");
      onSaved(saved);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not save these declarations. Please try again.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => save.mutate(values));

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <FieldShell
        label="Hosting country"
        htmlFor="ds-hosting-country"
        error={errors.hostingCountry?.message}
        hint={<p className="text-xs text-muted-foreground">CB-01: where this source's data is hosted. ISO country code, e.g. "IN".</p>}
      >
        <Input id="ds-hosting-country" {...register("hostingCountry")} />
      </FieldShell>

      <div className="space-y-1.5 rounded-md border border-border p-3">
        <CheckboxOption
          id="ds-publicly-available"
          label="This source holds only publicly-available data"
          {...register("containsOnlyPubliclyAvailableData")}
        />
        <p className="text-xs text-muted-foreground">
          SC-03: data the data principal herself made publicly available is outside the Act's
          scope. This is a human legal determination that this platform records -- it never
          concludes this on its own.
        </p>
      </div>

      {containsOnlyPubliclyAvailableData ? (
        <FieldShell
          label="Justification"
          htmlFor="ds-justification"
          error={errors.publiclyAvailableJustification?.message}
          hint={
            <p className="text-xs text-muted-foreground">
              Required. Explain why this source's data is publicly available.
            </p>
          }
        >
          <TextareaControl id="ds-justification" {...register("publiclyAvailableJustification")} />
        </FieldShell>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Finish"}
        </Button>
      </div>
    </form>
  );
}
