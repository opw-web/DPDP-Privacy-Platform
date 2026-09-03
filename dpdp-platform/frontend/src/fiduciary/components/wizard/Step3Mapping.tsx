import { Fragment, useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { CheckboxOption, SelectControl } from "../form-controls";
import {
  CANONICAL_FIELD_VALUES,
  DATA_CATEGORY_VALUES,
  MAPPING_COMPARISON_POLICY_VALUES,
  cacheMappingsResult,
  employeePut,
  type CanonicalField,
  type DataCategory,
  type MappingWarning,
  type MappingComparisonPolicy,
  type PublicDataSourceField,
  type PublicSourceFieldMapping,
  type ReplaceMappingsResult,
} from "../../lib/data-sources-api";
import { humanizeEnum } from "../../lib/enum-options";

const rowSchema = z
  .object({
    sourceField: z.string(),
    canonicalField: z.union([z.enum(CANONICAL_FIELD_VALUES), z.literal("")]),
    dataCategory: z.union([z.enum(DATA_CATEGORY_VALUES), z.literal("")]),
    containsPersonalData: z.boolean(),
    isVerifiedCustomerId: z.boolean(),
    comparisonPolicy: z.enum(MAPPING_COMPARISON_POLICY_VALUES),
  });

const mappingFormSchema = z.object({ rows: z.array(rowSchema) }).superRefine((values, ctx) => {
  values.rows.forEach((row, index) => {
    if (row.canonicalField === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows", index, "canonicalField"],
        message: 'Choose a canonical field, or "Not carried forward" to drop it.',
      });
    } else if (row.canonicalField !== "IGNORE" && row.dataCategory === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows", index, "dataCategory"],
        message: "Choose the data category this field belongs to.",
      });
    }
  });

  const verified = values.rows.filter((row) => row.isVerifiedCustomerId);
  if (verified.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: "At most one field may be marked as the verified customer ID.",
    });
  }
  const misplaced = verified.find((row) => row.canonicalField !== "CUSTOMER_ID");
  if (misplaced) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rows"],
      message: 'Verified customer ID is only valid on a "Customer ID" mapping.',
    });
  }
});

type MappingFormValues = z.infer<typeof mappingFormSchema>;

function rowsFor(
  fields: PublicDataSourceField[],
  initialMappings: PublicSourceFieldMapping[] | undefined,
): MappingFormValues["rows"] {
  const bySourceField = new Map((initialMappings ?? []).map((m) => [m.sourceField, m]));
  return fields.map((field) => {
    const existing = bySourceField.get(field.fieldName);
    return {
      sourceField: field.fieldName,
      canonicalField: existing?.canonicalField ?? "",
      dataCategory: existing?.dataCategory ?? "",
      containsPersonalData: existing?.containsPersonalData ?? true,
      isVerifiedCustomerId: existing?.isVerifiedCustomerId ?? false,
      comparisonPolicy: existing?.comparisonPolicy ?? "NOT_COMPARABLE",
    };
  });
}

interface Step3MappingProps {
  dataSourceId: string;
  fields: PublicDataSourceField[];
  initialMappings?: PublicSourceFieldMapping[];
  /** Seeds the amber warning display before any save happens in this mount -- e.g. the Field Mapping tab's cached-from-last-save warnings (see `DataSourceDetailPage.tsx`). */
  initialWarnings?: MappingWarning[];
  onSaved: (result: ReplaceMappingsResult) => void;
}

/**
 * Step ③: map each discovered field to a canonical field and data
 * category, the `isVerifiedCustomerId` gate, and CN-02's data-minimisation
 * warning rendered inline in amber wherever the backend returns one for
 * that field -- the standing property, re-rendered fresh from whatever
 * the last `PUT /mappings` response said, not just at the instant of
 * saving.
 *
 * No canonical field or data category is ever pre-selected for a field
 * without a known prior mapping (`rowsFor` leaves both `""`, which the
 * schema's own validation, not a disabled button, rejects on submit) --
 * consistent with this codebase's "never suggest a default" rule for a
 * legal classification (`PurposeForm`'s `lawfulBasis`).
 */
export function Step3Mapping({
  dataSourceId,
  fields,
  initialMappings,
  initialWarnings,
  onSaved,
}: Step3MappingProps) {
  const queryClient = useQueryClient();
  const [warnings, setWarnings] = useState<MappingWarning[]>(initialWarnings ?? []);
  const [isSaving, setIsSaving] = useState(false);

  const { control, register, handleSubmit, reset, watch, formState: { errors } } =
    useForm<MappingFormValues>({
      resolver: zodResolver(mappingFormSchema),
      defaultValues: { rows: rowsFor(fields, initialMappings) },
    });
  const { fields: rowFields } = useFieldArray({ control, name: "rows" });
  const watchedRows = watch("rows");

  useEffect(() => {
    reset({ rows: rowsFor(fields, initialMappings) });
    // Only re-seed when the discovered field set itself changes -- not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const warningsByField = new Map(warnings.map((w) => [w.sourceField, w]));
  const rowsError = errors.rows as unknown as
    | { message?: string; root?: { message?: string } }
    | undefined;
  const rootError = rowsError?.root?.message ?? rowsError?.message;

  const onSubmit = handleSubmit(async (values) => {
    setIsSaving(true);
    try {
      const mappings = values.rows.map((row) => ({
        sourceField: row.sourceField,
        canonicalField: row.canonicalField as CanonicalField,
        dataCategory:
          row.canonicalField === "IGNORE" || row.dataCategory === ""
            ? undefined
            : (row.dataCategory as DataCategory),
        containsPersonalData: row.containsPersonalData,
        isVerifiedCustomerId: row.isVerifiedCustomerId,
        comparisonPolicy: row.comparisonPolicy as MappingComparisonPolicy,
      }));
      const result = await employeePut<ReplaceMappingsResult>(
        `/data-sources/${dataSourceId}/mappings`,
        { mappings },
      );
      setWarnings(result.warnings);
      cacheMappingsResult(queryClient, dataSourceId, result);
      toast.success(
        result.warnings.length > 0
          ? `Mappings saved with ${result.warnings.length} data-minimisation warning(s).`
          : "Mappings saved.",
      );
      onSaved(result);
    } catch (error) {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not save these mappings. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  });

  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No discovered fields yet. Go back to "Discover schema" (Step 2) before mapping fields.
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <p className="text-sm text-muted-foreground">
        Map each discovered field to a canonical field and data category, or mark it "Not carried
        forward" to drop it. Review its comparison policy too: only values explicitly declared
        accuracy-comparable across every linked source become GO-03 dashboard findings. "Not
        comparable" is the safe default until you confirm the fields mean the same fact.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Source field</th>
              <th className="px-3 py-2">Sample</th>
              <th className="px-3 py-2">Canonical field</th>
              <th className="px-3 py-2">Data category</th>
              <th className="px-3 py-2">Personal data</th>
              <th className="px-3 py-2">Verified customer ID</th>
              <th className="px-3 py-2">Comparison policy</th>
            </tr>
          </thead>
          <tbody>
            {rowFields.map((row, index) => {
              const sourceField = fields[index]?.fieldName ?? row.sourceField;
              const sampleValue = fields[index]?.sampleValue;
              const canonicalField = watchedRows[index]?.canonicalField;
              const isIgnored = canonicalField === "IGNORE";
              const isCustomerId = canonicalField === "CUSTOMER_ID";
              const warning = warningsByField.get(sourceField);
              return (
                <Fragment key={row.id}>
                  <tr className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{sourceField}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {sampleValue ?? <span className="italic">(none)</span>}
                    </td>
                    <td className="px-3 py-2">
                      <SelectControl
                        aria-label={`Canonical field for ${sourceField}`}
                        {...register(`rows.${index}.canonicalField`)}
                      >
                        <option value="">Select&hellip;</option>
                        {CANONICAL_FIELD_VALUES.map((value) => (
                          <option key={value} value={value}>
                            {value === "IGNORE" ? "Not carried forward" : humanizeEnum(value)}
                          </option>
                        ))}
                      </SelectControl>
                      {errors.rows?.[index]?.canonicalField ? (
                        <p className="mt-1 text-xs text-destructive">
                          {errors.rows[index]?.canonicalField?.message}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <SelectControl
                        aria-label={`Data category for ${sourceField}`}
                        disabled={isIgnored}
                        {...register(`rows.${index}.dataCategory`)}
                      >
                        <option value="">Select&hellip;</option>
                        {DATA_CATEGORY_VALUES.map((value) => (
                          <option key={value} value={value}>
                            {humanizeEnum(value)}
                          </option>
                        ))}
                      </SelectControl>
                      {errors.rows?.[index]?.dataCategory ? (
                        <p className="mt-1 text-xs text-destructive">
                          {errors.rows[index]?.dataCategory?.message}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <CheckboxOption
                        id={`row-${index}-personal`}
                        label="Contains personal data"
                        disabled={isIgnored}
                        {...register(`rows.${index}.containsPersonalData`)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <CheckboxOption
                        id={`row-${index}-verified`}
                        label="Verified"
                        disabled={!isCustomerId}
                        {...register(`rows.${index}.isVerifiedCustomerId`)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <SelectControl
                        aria-label={`Comparison policy for ${sourceField}`}
                        disabled={isIgnored}
                        {...register(`rows.${index}.comparisonPolicy`)}
                      >
                        <option value="NOT_COMPARABLE">Not comparable (safe default)</option>
                        <option value="MULTI_VALUE">Multiple values are expected</option>
                        <option value="ACCURACY_COMPARABLE">Accuracy-comparable same fact</option>
                      </SelectControl>
                    </td>
                  </tr>
                  {warning ? (
                    <tr>
                      <td colSpan={7} className="px-3 pb-3">
                        <div
                          className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber-foreground"
                          role="note"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{warning.message}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {rootError ? <p className="text-sm text-destructive">{rootError}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save mappings"}
        </Button>
      </div>
    </form>
  );
}
