import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { Skeleton } from "../../components/shared/Skeleton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { CheckboxOption, SelectControl } from "../components/form-controls";
import { SdfDeclarationCard, type ThirdScheduleClass } from "../components/SdfDeclarationCard";
import { humanizeEnum } from "../lib/enum-options";

/** Mirrors `EntityRole` (`prisma/schema.prisma`) exactly. */
const ENTITY_ROLES = ["DATA_FIDUCIARY", "DATA_PROCESSOR", "BOTH"] as const;
type EntityRole = (typeof ENTITY_ROLES)[number];

/**
 * Mirrors `Organization` (`prisma/schema.prisma`, spec lines 209-238)
 * exactly, as returned whole by `GET /api/organization`
 * (`organizations.service.ts`'s `get()` does no field selection).
 * `registeredUserCount` is a `BigInt` column serialized as a decimal
 * STRING by the backend's global `BigInt.prototype.toJSON` shim.
 */
interface Organization {
  id: string;
  name: string;
  legalName: string | null;
  entityRole: EntityRole;
  country: string;
  timezone: string;
  offersGoodsServicesInIndia: boolean;
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
  dpoIsIndiaBased: boolean;
  responsiblePersonName: string | null;
  responsiblePersonEmail: string | null;
  grievanceContactEmail: string | null;
  publicPrivacyPageUrl: string | null;
  isSignificantDataFiduciary: boolean;
  sdfNotifiedAt: string | null;
  sdfNotificationRef: string | null;
  thirdScheduleClass: ThirdScheduleClass;
  registeredUserCount: string | null;
  classDeclaredByEmployeeId: string | null;
  classDeclaredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function describeSettingsError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You do not have permission to change organization settings.";
    }
    if (error.message) {
      return error.message;
    }
  }
  return fallback;
}

// ── Organization details + timezone ─────────────────────────────────────

const orgDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  legalName: z.string(),
  entityRole: z.enum(ENTITY_ROLES),
  country: z.string().trim().min(1, "Country is required"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  offersGoodsServicesInIndia: z.boolean(),
});
type OrgDetailsValues = z.infer<typeof orgDetailsSchema>;

function toOrgDetailsValues(org: Organization): OrgDetailsValues {
  return {
    name: org.name,
    legalName: org.legalName ?? "",
    entityRole: org.entityRole,
    country: org.country,
    timezone: org.timezone,
    offersGoodsServicesInIndia: org.offersGoodsServicesInIndia,
  };
}

function OrganizationDetailsSection({ organization }: { organization: Organization }) {
  const queryClient = useQueryClient();
  const form = useForm<OrgDetailsValues>({
    resolver: zodResolver(orgDetailsSchema),
    values: toOrgDetailsValues(organization),
  });

  const mutation = useMutation({
    mutationFn: (values: OrgDetailsValues) =>
      employeeApiClient.patch("/organization", {
        name: values.name,
        legalName: values.legalName || undefined,
        entityRole: values.entityRole,
        country: values.country,
        timezone: values.timezone,
        offersGoodsServicesInIndia: values.offersGoodsServicesInIndia,
      }),
    onSuccess: () => {
      toast.success("Organization details saved.");
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (error) => {
      toast.error(describeSettingsError(error, "Could not save organization details. Please try again."));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organization details</CardTitle>
        <CardDescription>
          Legal identity, entity role (SC-04) and the timezone every timestamp in this console is
          displayed in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PermissionGate
          permission="CAN_CHANGE_ORG_SETTINGS"
          fallback={
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd>{organization.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Legal name</dt>
                <dd>{organization.legalName ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entity role</dt>
                <dd>{humanizeEnum(organization.entityRole)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Country</dt>
                <dd>{organization.country}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Timezone</dt>
                <dd>{organization.timezone}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Offers goods/services in India</dt>
                <dd>{organization.offersGoodsServicesInIndia ? "Yes" : "No"}</dd>
              </div>
            </dl>
          }
        >
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" {...form.register("name")} />
              {form.formState.errors.name ? (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-legal-name">Legal name</Label>
              <Input id="org-legal-name" {...form.register("legalName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-entity-role">Entity role</Label>
              <SelectControl id="org-entity-role" {...form.register("entityRole")}>
                {ENTITY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {humanizeEnum(role)}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-country">Country</Label>
              <Input id="org-country" {...form.register("country")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-timezone">Timezone</Label>
              <Input id="org-timezone" placeholder="e.g. Asia/Kolkata" {...form.register("timezone")} />
              <p className="text-xs text-muted-foreground">
                An IANA timezone name. Every timestamp in this console converts from UTC to this
                timezone exactly once, at display time.
              </p>
              {form.formState.errors.timezone ? (
                <p className="text-sm text-destructive">{form.formState.errors.timezone.message}</p>
              ) : null}
            </div>
            <div className="flex items-end sm:col-span-2">
              <CheckboxOption
                id="org-offers-goods-services"
                label="Offers goods or services to data principals in India (SC-02)"
                {...form.register("offersGoodsServicesInIndia")}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save organization details"}
              </Button>
            </div>
          </form>
        </PermissionGate>
      </CardContent>
    </Card>
  );
}

// ── DPO / responsible person contact (GO-10) ────────────────────────────

const optionalEmail = z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]);
const optionalUrl = z.union([z.literal(""), z.string().trim().url("Enter a valid URL")]);

const dpoContactSchema = z.object({
  dpoName: z.string(),
  dpoEmail: optionalEmail,
  dpoPhone: z.string(),
  dpoIsIndiaBased: z.boolean(),
  responsiblePersonName: z.string(),
  responsiblePersonEmail: optionalEmail,
  grievanceContactEmail: optionalEmail,
  publicPrivacyPageUrl: optionalUrl,
});
type DpoContactValues = z.infer<typeof dpoContactSchema>;

function toDpoContactValues(org: Organization): DpoContactValues {
  return {
    dpoName: org.dpoName ?? "",
    dpoEmail: org.dpoEmail ?? "",
    dpoPhone: org.dpoPhone ?? "",
    dpoIsIndiaBased: org.dpoIsIndiaBased,
    responsiblePersonName: org.responsiblePersonName ?? "",
    responsiblePersonEmail: org.responsiblePersonEmail ?? "",
    grievanceContactEmail: org.grievanceContactEmail ?? "",
    publicPrivacyPageUrl: org.publicPrivacyPageUrl ?? "",
  };
}

/**
 * The Rule 9 / s.8(9) published contact (GO-10): a Data Protection
 * Officer where one is appointed, otherwise the responsible person named
 * in their place, plus a grievance contact and -- the part GO-10 actually
 * turns on -- WHERE this is published for data principals to find
 * (`publicPrivacyPageUrl`).
 */
function DpoContactSection({ organization }: { organization: Organization }) {
  const queryClient = useQueryClient();
  const form = useForm<DpoContactValues>({
    resolver: zodResolver(dpoContactSchema),
    values: toDpoContactValues(organization),
  });

  const mutation = useMutation({
    mutationFn: (values: DpoContactValues) =>
      employeeApiClient.patch("/organization", {
        dpoName: values.dpoName || undefined,
        dpoEmail: values.dpoEmail || undefined,
        dpoPhone: values.dpoPhone || undefined,
        dpoIsIndiaBased: values.dpoIsIndiaBased,
        responsiblePersonName: values.responsiblePersonName || undefined,
        responsiblePersonEmail: values.responsiblePersonEmail || undefined,
        grievanceContactEmail: values.grievanceContactEmail || undefined,
        publicPrivacyPageUrl: values.publicPrivacyPageUrl || undefined,
      }),
    onSuccess: () => {
      toast.success("Contact details saved.");
      void queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (error) => {
      toast.error(describeSettingsError(error, "Could not save contact details. Please try again."));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DPO / responsible person contact</CardTitle>
        <CardDescription>
          The published contact for data principal requests and grievances (GO-10, Rule 9 / s.8(9)).
          Fill in the Data Protection Officer if one is appointed, or the responsible person named in
          their place otherwise.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PermissionGate
          permission="CAN_CHANGE_ORG_SETTINGS"
          fallback={
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">DPO name</dt>
                <dd>{organization.dpoName ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">DPO email</dt>
                <dd>{organization.dpoEmail ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">DPO phone</dt>
                <dd>{organization.dpoPhone ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">DPO based in India</dt>
                <dd>{organization.dpoIsIndiaBased ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Responsible person</dt>
                <dd>{organization.responsiblePersonName ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Responsible person email</dt>
                <dd>{organization.responsiblePersonEmail ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Grievance contact email</dt>
                <dd>{organization.grievanceContactEmail ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Published at</dt>
                <dd>{organization.publicPrivacyPageUrl ?? "Not recorded"}</dd>
              </div>
            </dl>
          }
        >
          <form
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="dpo-name">DPO name</Label>
              <Input id="dpo-name" {...form.register("dpoName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dpo-email">DPO email</Label>
              <Input id="dpo-email" type="email" {...form.register("dpoEmail")} />
              {form.formState.errors.dpoEmail ? (
                <p className="text-sm text-destructive">{form.formState.errors.dpoEmail.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dpo-phone">DPO phone</Label>
              <Input id="dpo-phone" {...form.register("dpoPhone")} />
            </div>
            <div className="flex items-end">
              <CheckboxOption
                id="dpo-india-based"
                label="DPO is based in India (SD-01)"
                {...form.register("dpoIsIndiaBased")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="responsible-person-name">Responsible person (if no DPO is appointed)</Label>
              <Input id="responsible-person-name" {...form.register("responsiblePersonName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="responsible-person-email">Responsible person email</Label>
              <Input id="responsible-person-email" type="email" {...form.register("responsiblePersonEmail")} />
              {form.formState.errors.responsiblePersonEmail ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.responsiblePersonEmail.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grievance-contact-email">Grievance contact email</Label>
              <Input id="grievance-contact-email" type="email" {...form.register("grievanceContactEmail")} />
              {form.formState.errors.grievanceContactEmail ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.grievanceContactEmail.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public-privacy-page-url">Published at (privacy / notice page URL)</Label>
              <Input
                id="public-privacy-page-url"
                type="url"
                placeholder="https://example.com/privacy"
                {...form.register("publicPrivacyPageUrl")}
              />
              <p className="text-xs text-muted-foreground">
                Where this contact is actually published for data principals to find (GO-10).
              </p>
              {form.formState.errors.publicPrivacyPageUrl ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.publicPrivacyPageUrl.message}
                </p>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save contact details"}
              </Button>
            </div>
          </form>
        </PermissionGate>
      </CardContent>
    </Card>
  );
}

/**
 * `/app/settings` (spec line 860): organization details and timezone,
 * the DPO / responsible-person contact and where it is published
 * (GO-10), and the SDF / Third Schedule self-declaration
 * (`SdfDeclarationCard`). All three sections write through the same
 * `PATCH /api/organization` (`organizations.controller.ts`); the backend
 * splits the fields it receives into up to three audit events
 * (`ORG_SETTINGS_UPDATED`, `SDF_STATUS_DECLARED`,
 * `THIRD_SCHEDULE_CLASS_DECLARED`) -- this page just sends each
 * section's own fields, one section at a time.
 *
 * Every edit affordance across all three sections is wrapped in
 * `<PermissionGate permission="CAN_CHANGE_ORG_SETTINGS">`; an actor
 * without it sees the current values read-only, never a form. That gate
 * is cosmetic only -- `OrganizationsController.update` is independently
 * `@RequirePermission("CAN_CHANGE_ORG_SETTINGS")`-gated, and a forged
 * `PATCH` still 403s there.
 */
export function SettingsPage() {
  const { data: organization, isLoading } = useQuery({
    queryKey: ["organization"],
    queryFn: () => employeeApiClient.get<Organization>("/organization"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organization settings</h1>
        <p className="text-sm text-muted-foreground">
          Organization identity, the published DPO / responsible-person contact, and this
          organization's own SDF and Third Schedule self-declaration.
        </p>
      </div>

      {isLoading || !organization ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <OrganizationDetailsSection organization={organization} />
          <DpoContactSection organization={organization} />
          <SdfDeclarationCard organization={organization} />
        </>
      )}
    </div>
  );
}
