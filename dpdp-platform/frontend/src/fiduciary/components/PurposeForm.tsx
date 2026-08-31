import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { employeeApiClient, ApiError } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { FieldShell, SelectControl, TextareaControl, CheckboxOption } from "./form-controls";
import {
  DATA_CATEGORY_OPTIONS,
  LAWFUL_BASIS_OPTIONS,
  LAWFUL_BASIS_VALUES,
  LEGITIMATE_USE_LIMB_OPTIONS,
  LEGITIMATE_USE_LIMB_VALUES,
} from "../lib/enum-options";

/**
 * Spec lines 739-748 (LB-01, LB-02): creating a purpose REQUIRES
 * `lawfulBasis`, with no default and no inference. `lawfulBasis` is a
 * bare `z.enum(...)` with no `.optional()` and no `defaultValue` supplied
 * anywhere below -- the native `<select>` starts on its own placeholder
 * option (value `""`), which fails this enum check, so the schema itself
 * -- not a disabled submit button -- is what makes the empty state
 * unsubmittable. `legitimateUseLimb` is required precisely when
 * `lawfulBasis` is `LEGITIMATE_USE` (`.superRefine`, mirroring
 * `PurposesService.validateBasis()` on the backend).
 */
const purposeFormSchema = z
  .object({
    code: z.string().trim().min(1, "Code is required."),
    name: z.string().trim().min(1, "Name is required."),
    description: z.string().trim().min(1, "Description is required."),
    lawfulBasis: z.enum(LAWFUL_BASIS_VALUES, {
      errorMap: () => ({
        message:
          "Choose a lawful basis. There is no default, and none is inferred (LB-02).",
      }),
    }),
    legitimateUseLimb: z.union([z.enum(LEGITIMATE_USE_LIMB_VALUES), z.literal("")]),
    basisJustification: z
      .string()
      .trim()
      .min(1, "Explain, in your own words, why this basis applies."),
    dataCategories: z.array(z.string()),
    goodsOrServicesDescription: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.lawfulBasis === "LEGITIMATE_USE" && values.legitimateUseLimb === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legitimateUseLimb"],
        message: "Select which s.7 limb applies. Required for Legitimate Use.",
      });
    }
  });

type PurposeFormValues = z.infer<typeof purposeFormSchema>;

/**
 * No `lawfulBasis` key here, on purpose -- see the schema doc comment
 * above. `useForm`'s `defaultValues` accepts a deep-partial shape, so
 * leaving it out (rather than assigning it a placeholder value) is what
 * keeps the field genuinely unset until a human picks one.
 */
const DEFAULT_VALUES: Partial<PurposeFormValues> = {
  code: "",
  name: "",
  description: "",
  legitimateUseLimb: "",
  basisJustification: "",
  dataCategories: [] as string[],
  goodsOrServicesDescription: "",
};

interface CreatePurposePayload {
  code: string;
  name: string;
  description: string;
  lawfulBasis: string;
  legitimateUseLimb?: string;
  basisJustification: string;
  dataCategories?: string[];
  goodsOrServicesDescription?: string;
}

interface PurposeFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PurposeForm({ onSuccess, onCancel }: PurposeFormProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PurposeFormValues>({
    resolver: zodResolver(purposeFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const lawfulBasis = watch("lawfulBasis");

  const createPurpose = useMutation({
    mutationFn: (payload: CreatePurposePayload) =>
      employeeApiClient.post("/purposes", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["purposes"] });
      toast.success("Purpose created.");
      onSuccess();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(`A purpose with this code already exists in this organization.`);
        return;
      }
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not create this purpose. Please try again.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      const payload: CreatePurposePayload = {
        code: values.code,
        name: values.name,
        description: values.description,
        lawfulBasis: values.lawfulBasis,
        basisJustification: values.basisJustification,
        dataCategories: values.dataCategories.length > 0 ? values.dataCategories : undefined,
        goodsOrServicesDescription: values.goodsOrServicesDescription || undefined,
      };
      if (values.lawfulBasis === "LEGITIMATE_USE" && values.legitimateUseLimb) {
        payload.legitimateUseLimb = values.legitimateUseLimb;
      }
      await createPurpose.mutateAsync(payload);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Code" htmlFor="purpose-code" error={errors.code?.message}>
          <Input id="purpose-code" placeholder="ORDER_FULFILMENT" {...register("code")} />
        </FieldShell>
        <FieldShell label="Name" htmlFor="purpose-name" error={errors.name?.message}>
          <Input id="purpose-name" {...register("name")} />
        </FieldShell>
      </div>

      <FieldShell
        label="Description"
        htmlFor="purpose-description"
        error={errors.description?.message}
        hint={<p className="text-xs text-muted-foreground">Plain language -- reused in notices (MVP 2).</p>}
      >
        <TextareaControl id="purpose-description" {...register("description")} />
      </FieldShell>

      <FieldShell
        label="Lawful basis"
        htmlFor="purpose-lawful-basis"
        error={errors.lawfulBasis?.message}
      >
        <SelectControl id="purpose-lawful-basis" defaultValue="" {...register("lawfulBasis")}>
          <option value="" disabled>
            Select a lawful basis&hellip;
          </option>
          {LAWFUL_BASIS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectControl>
      </FieldShell>

      {lawfulBasis === "LEGITIMATE_USE" ? (
        <FieldShell
          label="Section 7 limb"
          htmlFor="purpose-limb"
          error={errors.legitimateUseLimb?.message}
        >
          <SelectControl id="purpose-limb" defaultValue="" {...register("legitimateUseLimb")}>
            <option value="" disabled>
              Select the applicable limb&hellip;
            </option>
            {LEGITIMATE_USE_LIMB_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      ) : null}

      {lawfulBasis === "CONSENT" ? (
        <div className="rounded-md border border-amber/40 bg-amber/10 p-3 text-sm text-amber-foreground" role="note">
          A notice and consent record will be required in MVP 2 before this purpose may be
          relied on.
        </div>
      ) : null}

      <FieldShell
        label="Justification"
        htmlFor="purpose-justification"
        error={errors.basisJustification?.message}
        hint={
          <p className="text-xs text-muted-foreground">
            Free text written by a human explaining why this basis applies.
          </p>
        }
      >
        <TextareaControl id="purpose-justification" {...register("basisJustification")} />
      </FieldShell>

      <div className="space-y-1.5">
        <Label>Data categories necessary for this purpose</Label>
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
                    id={`purpose-category-${option.value}`}
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
        <p className="text-xs text-muted-foreground">
          Only what is necessary. A mapping later assigning an unlisted category will raise a
          data-minimisation warning (CN-02) -- it warns, it does not block.
        </p>
      </div>

      <FieldShell
        label="Goods or services description (optional)"
        htmlFor="purpose-goods"
        error={errors.goodsOrServicesDescription?.message}
      >
        <Input id="purpose-goods" {...register("goodsOrServicesDescription")} />
      </FieldShell>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create purpose"}
        </Button>
      </div>
    </form>
  );
}
