import { Injectable } from "@nestjs/common";
import type { DataCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LineageService } from "../principals/lineage.service";
import type { ResolvedPrincipalField } from "../principals/lineage.service";
import { PrincipalRecipientsService } from "../principals/principal-recipients.service";
import { PrincipalsService } from "../principals/principals.service";

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
 * Every public method here takes `dataPrincipalId` as its ONLY selector,
 * and every call site in `MeController` supplies it from
 * `@CurrentPrincipal()` -- i.e. from the verified access token via
 * `JwtPrincipalGuard` -- never from a path/query/body parameter. See that
 * controller's file-level docstring and `me.controller.spec-of-intent`
 * (the route-table assertion in `principal-portal.e2e-spec.ts`) for the
 * enforcement of that rule.
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

  /** `/me/profile` -- her own profile, values never masked. */
  async getProfile(dataPrincipalId: string) {
    return this.principalsService.getUnmaskedProfile(dataPrincipalId);
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
