import { Injectable } from "@nestjs/common";
import type { DataCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LineageService } from "../principals/lineage.service";
import type { ResolvedPrincipalField } from "../principals/lineage.service";
import { PrincipalRecipientsService } from "../principals/principal-recipients.service";
import { PrincipalsService } from "../principals/principals.service";
import { MePrivacyContactDto } from "./dto/me-privacy-contact.dto";

/**
 * Literal text shown wherever a value's contributing source(s) carry no
 * attached `ProcessingPurpose`. Matches `SourcePurposesService`'s
 * documented convention (`source-purposes.service.ts:22-28`) and the
 * brief/Check 11 wording verbatim -- never a guessed purpose.
 */
export const PURPOSE_NOT_CONFIGURED = "Purpose not configured";

/**
 * Stable display order for `/me/data` category groups, taken directly
 * from the `DataCategory` enum's declaration order in `schema.prisma`.
 * Only categories that actually have at least one value are emitted.
 */
const DATA_CATEGORY_ORDER: readonly DataCategory[] = [
  "IDENTITY",
  "CONTACT",
  "DEMOGRAPHIC",
  "FINANCIAL",
  "TRANSACTIONAL",
  "BEHAVIOURAL",
  "LOCATION",
  "HEALTH",
  "BIOMETRIC",
  "GOVT_ID",
  "OTHER",
];

export interface MeDataValue {
  id: string;
  canonicalField: ResolvedPrincipalField["canonicalField"];
  value: string;
  isPrimary: boolean;
  conflict: boolean;
  updatedAt: Date;
  sources: Array<{ id: string; name: string }>;
  purposes: string[];
}

export interface MeDataCategoryGroup {
  dataCategory: DataCategory;
  values: MeDataValue[];
}

/**
 * The Data Principal's own read services, `/api/me/*`.
 *
 * Every public method that reads data ABOUT the calling principal takes
 * `dataPrincipalId` as its ONLY selector, and every call site in
 * `MeController` supplies it from `@CurrentPrincipal()` -- i.e. from the
 * verified access token via `JwtPrincipalGuard` -- never from a
 * path/query/body parameter. See that controller's file-level docstring
 * and `me.controller.spec-of-intent` (the route-table assertion in
 * `principal-portal.e2e-spec.ts`) for the enforcement of that rule.
 * `getPrivacyContact` is the one exception: it reads a fact about the
 * ORGANIZATION, not the principal, so it takes no selector at all and
 * relies on `prisma.scoped` resolving the caller's own organization from
 * `TenantContext` -- see that method's own docstring.
 *
 * DELIBERATELY reuses `PrincipalsService.getUnmaskedProfile`,
 * `LineageService.getResolvedFields` and
 * `PrincipalRecipientsService.listForPrincipal` rather than duplicating
 * their provenance/masking-bypass/RT-04-intersection logic (task brief:
 * "consume the assembly output via the principals services, do not
 * duplicate that logic").
 *
 * DELIBERATELY never calls `AccessLogService.recordPersonalDataViewed`.
 * That log answers "who looked at THIS PERSON's data" (see its own
 * docstring, `access-log.service.ts:14-24`) -- a question that
 * presupposes an actor distinct from the subject. A Data Principal
 * reading her own `/me/*` data is not that event, and `getUnmaskedProfile`
 * was deliberately built without that call for exactly this reason
 * (`principals.service.ts:216-221`). `LineageService`/
 * `PrincipalRecipientsService` never called it either. This class adds no
 * call to it either, and also writes no `PrincipalContactEvent` -- see
 * this module's report for the full reasoning (repeated in
 * `principal-portal.module.ts`'s docstring): the channel vocabulary has no
 * member for "she viewed her own data", `PrincipalAuthService.login`
 * already records the `PORTAL_LOGIN` contact event that makes this
 * session possible, and a row per GET would dilute contact history rather
 * than evidence it.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principalsService: PrincipalsService,
    private readonly lineageService: LineageService,
    private readonly recipientsService: PrincipalRecipientsService,
  ) {}

  /**
   * `/me/profile` -- her own profile, values never masked, plus
   * `organizationTimezone`: the IANA zone of her OWN organization,
   * resolved through `prisma.scoped` from the caller's already-bound
   * `TenantContext` -- the exact same "no `where: { organizationId }`
   * written here" shape `getPrivacyContact` below uses, never an id
   * carried on the request. Global constraint #7 ("timestamptz in UTC
   * everywhere; convert to the organization's timezone exactly once, at
   * the render boundary") means every other `/me/*` timestamp is stored
   * and transmitted in UTC; this is the one field that lets the portal's
   * shared `<DateTime>` component do that conversion instead of quietly
   * falling back to a literal `"UTC"` default (task brief).
   *
   * `Organization.timezone` is a `NOT NULL` column with a schema default
   * (`schema.prisma`: `@default("Asia/Kolkata")`), so this is ordinarily
   * never empty, and `UpdateOrganizationDto.timezone` now also carries
   * `@IsNotEmpty()` so a write can no longer clear it to `""` from the
   * settings page. This normalization stays anyway as the read path's own
   * defense in depth (e.g. against a row written before that validation
   * existed) -- an empty string is normalized to `null` here, matching
   * `getPrivacyContact`'s own "`null`, never `""`" convention for "not
   * configured", rather than passed through for `<DateTime>` to treat as
   * an unrecognised zone and silently mis-render.
   */
  async getProfile(dataPrincipalId: string) {
    const profile =
      await this.principalsService.getUnmaskedProfile(dataPrincipalId);
    const organization = await this.prisma.scoped.organization.findFirstOrThrow(
      { select: { timezone: true } },
    );
    return {
      ...profile,
      organizationTimezone:
        organization.timezone.trim().length > 0 ? organization.timezone : null,
    };
  }

  /**
   * `/me/data` -- every attributable value, grouped by `DataCategory`,
   * each carrying the systems holding it ("Held in: ...") and the
   * purposes it is used for ("Used for: ..." or `PURPOSE_NOT_CONFIGURED`
   * when none of its contributing sources has one attached).
   */
  async getData(dataPrincipalId: string): Promise<MeDataCategoryGroup[]> {
    const fields = await this.lineageService.getResolvedFields(dataPrincipalId);
    const sourceIds = [
      ...new Set(fields.flatMap((field) => field.sources.map((s) => s.id))),
    ];
    const purposeNamesBySource = await this.loadPurposeNamesBySource(sourceIds);

    const byCategory = new Map<DataCategory, MeDataValue[]>();
    for (const field of fields) {
      const purposeNames = [
        ...new Set(
          field.sources.flatMap(
            (source) => purposeNamesBySource.get(source.id) ?? [],
          ),
        ),
      ].sort((left, right) => left.localeCompare(right));
      const value: MeDataValue = {
        id: field.id,
        canonicalField: field.canonicalField,
        value: field.value,
        isPrimary: field.isPrimary,
        conflict: field.conflict,
        updatedAt: field.updatedAt,
        sources: field.sources,
        purposes:
          purposeNames.length > 0 ? purposeNames : [PURPOSE_NOT_CONFIGURED],
      };
      const bucket = byCategory.get(field.dataCategory) ?? [];
      bucket.push(value);
      byCategory.set(field.dataCategory, bucket);
    }

    return DATA_CATEGORY_ORDER.filter((category) =>
      byCategory.has(category),
    ).map((category) => ({
      dataCategory: category,
      // Non-null: filtered to categories present in the map above.
      values: byCategory.get(category)!,
    }));
  }

  /** `/me/sources` -- the distinct systems holding any of her data. */
  async getSources(
    dataPrincipalId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const fields = await this.lineageService.getResolvedFields(dataPrincipalId);
    const byId = new Map<string, { id: string; name: string }>();
    for (const field of fields) {
      for (const source of field.sources) {
        byId.set(source.id, source);
      }
    }
    return [...byId.values()].sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  }

  /** `/me/recipients` -- RT-04 preview, unchanged from the employee-facing service. */
  async getRecipients(dataPrincipalId: string) {
    return this.recipientsService.listForPrincipal(dataPrincipalId);
  }

  /**
   * `/me/privacy-contact` -- the organization's published DPO /
   * responsible-person contact (GO-10). Unlike every other method on this
   * class, this one takes NO selector at all: the contact belongs to the
   * organization, not to the calling principal, and `prisma.scoped` (the
   * one Prisma client extension that ever applies tenant isolation --
   * `tenant.extension.ts`) resolves "the organization" from the
   * `TenantContext` that `TenantMiddleware` already bound from the
   * caller's own verified token before this handler ever runs. There is
   * no `where: { organizationId }` written here or anywhere else in this
   * class -- exactly the same shape as `OrganizationsService.get()`,
   * which this deliberately mirrors rather than duplicating a second,
   * hand-rolled tenant filter for the same row.
   *
   * Selects only the five columns GO-10 requires be public. Never
   * `Organization.id`, `legalName`, `grievanceContactEmail`, `settings`,
   * or any other column on the row -- see `MePrivacyContactDto`'s
   * docstring for exactly what a member of the public is entitled to see
   * here and why the rest is withheld.
   *
   * Prefers the DPO (`dpoName`/`dpoEmail`/`dpoPhone`) when one is
   * appointed; falls back to the responsible person
   * (`responsiblePersonName`/`responsiblePersonEmail`) per the schema's
   * own documented convention (`schema.prisma`: "used when no DPO is
   * appointed"). "Appointed" is read off whether a name OR an email is
   * present for that role -- a partially-filled-in role (e.g. an email
   * with no name yet) still counts as configured, so it is shown rather
   * than silently dropped in favour of the "not published" state.
   *
   * When neither role has anything configured, returns the explicit
   * `published: false` shape with every other field `null` -- never an
   * empty string the UI would render as a blank (task brief). This is a
   * read of already-public information, not a fact about the calling
   * principal, so it writes neither a `PrincipalContactEvent` nor an
   * `AuditEvent`: it is not a state change, and `AuditAction` is a fixed
   * union with no member for "someone read the published contact" -- see
   * this module's other docstrings for why this codebase never invents
   * one.
   */
  async getPrivacyContact(): Promise<MePrivacyContactDto> {
    const organization = await this.prisma.scoped.organization.findFirstOrThrow(
      {
        select: {
          dpoName: true,
          dpoEmail: true,
          dpoPhone: true,
          responsiblePersonName: true,
          responsiblePersonEmail: true,
          publicPrivacyPageUrl: true,
        },
      },
    );

    const hasDpo = Boolean(organization.dpoName || organization.dpoEmail);
    const hasResponsiblePerson = Boolean(
      organization.responsiblePersonName || organization.responsiblePersonEmail,
    );

    if (!hasDpo && !hasResponsiblePerson) {
      return {
        published: false,
        contactName: null,
        contactEmail: null,
        contactPhone: null,
        isDpo: null,
        publicPrivacyPageUrl: null,
      };
    }

    return {
      published: true,
      contactName:
        (hasDpo ? organization.dpoName : organization.responsiblePersonName) ??
        null,
      contactEmail:
        (hasDpo
          ? organization.dpoEmail
          : organization.responsiblePersonEmail) ?? null,
      // The schema has no phone field for the responsible person, only
      // the DPO -- never invented, never borrowed from the other role.
      contactPhone: hasDpo ? (organization.dpoPhone ?? null) : null,
      isDpo: hasDpo,
      publicPrivacyPageUrl: organization.publicPrivacyPageUrl ?? null,
    };
  }

  /**
   * `DataSourcePurpose` is an indirectly tenant-scoped join table (see
   * `tenant-scoped-models.ts`): reading it through `prisma.scoped` already
   * ANDs both its `dataSource` and `purpose` relations' `organizationId`
   * into the WHERE clause, so every row this returns is already proven to
   * belong to the current tenant on both foreign keys -- unlike
   * `PrincipalRecipientsService`'s `recipientId` case, this is not a bare
   * scalar FK trusted blind. Even so, this deliberately does two SEPARATE
   * scoped queries rather than a nested `include`, matching this
   * codebase's one existing convention for resolving a join row's foreign
   * target (`principal-recipients.service.ts:29-34`) instead of adding a
   * second, differently-shaped pattern for the same problem.
   */
  private async loadPurposeNamesBySource(
    sourceIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (sourceIds.length === 0) {
      return result;
    }
    const links = await this.prisma.scoped.dataSourcePurpose.findMany({
      where: { dataSourceId: { in: [...sourceIds] } },
      select: { dataSourceId: true, purposeId: true },
    });
    if (links.length === 0) {
      return result;
    }
    const purposeIds = [...new Set(links.map((link) => link.purposeId))];
    const purposes = await this.prisma.scoped.processingPurpose.findMany({
      where: { id: { in: purposeIds } },
      select: { id: true, name: true },
    });
    const nameByPurposeId = new Map(
      purposes.map((purpose) => [purpose.id, purpose.name]),
    );
    for (const link of links) {
      const name = nameByPurposeId.get(link.purposeId);
      // A purposeId that fails to resolve in-tenant is dropped, never
      // guessed -- the same "unattributable data never leaks out"
      // discipline `LineageService` applies to sources.
      if (name === undefined) {
        continue;
      }
      const bucket = result.get(link.dataSourceId) ?? [];
      bucket.push(name);
      result.set(link.dataSourceId, bucket);
    }
    return result;
  }
}
