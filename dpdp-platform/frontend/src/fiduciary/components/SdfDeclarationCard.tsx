import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { DateTime } from "../../components/shared/DateTime";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckboxOption, SelectControl } from "./form-controls";
import { humanizeEnum } from "../lib/enum-options";

/** Mirrors `ThirdScheduleClass` (`prisma/schema.prisma`) exactly. Not exported: this card is the only place that needs the value list, so keeping it local avoids a cross-file value export purely for one enum (`ThirdScheduleClass`, the type, is what other files need). */
const THIRD_SCHEDULE_CLASSES = ["NONE", "ECOMMERCE", "ONLINE_GAMING", "SOCIAL_MEDIA"] as const;
export type ThirdScheduleClass = (typeof THIRD_SCHEDULE_CLASSES)[number];

/**
 * The subset of `Organization` (`prisma/schema.prisma`, spec lines
 * 209-238) this card reads and writes -- the SDF (SD-07) and Third
 * Schedule (RE-03) self-declaration fields, plus the two columns that
 * record who declared the Third Schedule class and when
 * (`classDeclaredByEmployeeId` / `classDeclaredAt`, stamped server side
 * by `OrganizationsService.update`). `registeredUserCount` is a `BigInt`
 * column serialized as a decimal STRING by the backend's global
 * `BigInt.prototype.toJSON` shim -- never parsed as a `number` here
 * except to round-trip it back into a request body.
 */
export interface SdfDeclarationFields {
  isSignificantDataFiduciary: boolean;
  sdfNotifiedAt: string | null;
  sdfNotificationRef: string | null;
  thirdScheduleClass: ThirdScheduleClass;
  registeredUserCount: string | null;
  classDeclaredByEmployeeId: string | null;
  classDeclaredAt: string | null;
}

interface SdfDeclarationCardProps {
  organization: SdfDeclarationFields;
  onSaved?: () => void;
}

const sdfFormSchema = z.object({
  isSignificantDataFiduciary: z.boolean(),
  sdfNotifiedAt: z.string(),
  sdfNotificationRef: z.string(),
  thirdScheduleClass: z.enum(THIRD_SCHEDULE_CLASSES),
  registeredUserCount: z.string(),
});
type SdfFormValues = z.infer<typeof sdfFormSchema>;

function toFormValues(organization: SdfDeclarationFields): SdfFormValues {
  return {
    isSignificantDataFiduciary: organization.isSignificantDataFiduciary,
    sdfNotifiedAt: organization.sdfNotifiedAt ? organization.sdfNotifiedAt.slice(0, 10) : "",
    sdfNotificationRef: organization.sdfNotificationRef ?? "",
    thirdScheduleClass: organization.thirdScheduleClass,
    registeredUserCount: organization.registeredUserCount ?? "",
  };
}

function describeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "You do not have permission to change organization settings.";
  }
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return "Could not save this declaration. Please try again.";
}

/**
 * The Significant Data Fiduciary (SD-07) and Third Schedule (RE-03)
 * self-declaration, rendered on `/app/settings`.
 *
 * The platform never infers either status from connected data -- both
 * are always a human decision made outside this system (by the Central
 * Government's notification, for SDF; by the organization's own
 * classification, for the Third Schedule), and this card only ever
 * *records* that decision, on the same `PATCH /api/organization` the
 * rest of the settings page uses. Every label here describes a
 * DECLARATION, never a compliance conclusion -- nothing on this card may
 * say the organization "is compliant" with anything.
 */
export function SdfDeclarationCard({ organization, onSaved }: SdfDeclarationCardProps) {
  const queryClient = useQueryClient();
  const form = useForm<SdfFormValues>({
    resolver: zodResolver(sdfFormSchema),
    values: toFormValues(organization),
  });

  const mutation = useMutation({
    mutationFn: (values: SdfFormValues) => {
      const payload: Record<string, unknown> = {
        isSignificantDataFiduciary: values.isSignificantDataFiduciary,
        thirdScheduleClass: values.thirdScheduleClass,
      };
      if (values.sdfNotifiedAt) payload.sdfNotifiedAt = values.sdfNotifiedAt;
      if (values.sdfNotificationRef) payload.sdfNotificationRef = values.sdfNotificationRef;
      if (values.registeredUserCount !== "") {
        payload.registeredUserCount = Number(values.registeredUserCount);
      }
      return employeeApiClient.patch("/organization", payload);
    },
    onSuccess: () => {
      toast.success("Declaration saved.");
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
      onSaved?.();
    },
    onError: (error) => {
      toast.error(describeSaveError(error));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Significant Data Fiduciary &amp; Third Schedule</CardTitle>
        <CardDescription>Self-declaration only (SD-07, RE-03).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="note"
          className="flex gap-2 rounded-md border border-amber/40 bg-amber/10 p-3 text-sm text-amber-foreground"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            <strong>This is your organization&apos;s own determination, not ours.</strong> The
            platform never infers Significant Data Fiduciary status or a Third Schedule class from
            your connected data -- it only records what your organization declares here, and when.
          </p>
        </div>

        <PermissionGate
          permission="CAN_CHANGE_ORG_SETTINGS"
          fallback={
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Significant Data Fiduciary</dt>
                <dd>{organization.isSignificantDataFiduciary ? "Declared" : "Not declared"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Third Schedule class</dt>
                <dd>{humanizeEnum(organization.thirdScheduleClass)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Notification reference</dt>
                <dd>{organization.sdfNotificationRef ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Registered users</dt>
                <dd>{organization.registeredUserCount ?? "Not recorded"}</dd>
              </div>
            </dl>
          }
        >
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            <div className="sm:col-span-2">
              <CheckboxOption
                id="sdf-declared"
                label="We have been notified as a Significant Data Fiduciary"
                {...form.register("isSignificantDataFiduciary")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sdf-notified-at">Notified on</Label>
              <Input id="sdf-notified-at" type="date" {...form.register("sdfNotifiedAt")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sdf-notification-ref">Notification reference</Label>
              <Input id="sdf-notification-ref" {...form.register("sdfNotificationRef")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="third-schedule-class">Third Schedule class</Label>
              <SelectControl id="third-schedule-class" {...form.register("thirdScheduleClass")}>
                {THIRD_SCHEDULE_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {humanizeEnum(cls)}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="registered-user-count">Registered users in India</Label>
              <Input
                id="registered-user-count"
                type="number"
                min={0}
                inputMode="numeric"
                {...form.register("registeredUserCount")}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save declaration"}
              </Button>
            </div>
          </form>
        </PermissionGate>

        {organization.classDeclaredAt ? (
          <p className="text-xs text-muted-foreground">
            Third Schedule class last declared
            {organization.classDeclaredByEmployeeId ? ` by employee ${organization.classDeclaredByEmployeeId}` : ""}{" "}
            on <DateTime value={organization.classDeclaredAt} />.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
