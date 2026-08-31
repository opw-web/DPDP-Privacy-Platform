import { BadRequestException, Injectable } from "@nestjs/common";
import { AgeStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { MaskingService } from "../../../common/masking/masking.service";
import { compileAudience } from "./compile-audience";
import { AudienceFilterError } from "./audience-filter.error";
import type { AudienceFilter } from "./audience-filter.types";
import type { PreviewAudienceDto } from "./dto/preview-audience.dto";

/** s.9(3): a child cannot self-determine marketing consent, and a
 * guardian-represented adult is, by this project's own deliberate
 * widening of the spec's pseudocode (task brief), treated the same way
 * -- neither is self-determining, so both fall under the marketing
 * prohibition. `AgeStatus` has FOUR values (UNKNOWN, ADULT, CHILD,
 * GUARDIAN_REPRESENTED), not three. */
const CHILD_LIKE_AGE_STATUSES: readonly AgeStatus[] = ["CHILD", "GUARDIAN_REPRESENTED"];

export interface AudiencePreviewResult {
  total: number;
  withEmail: number;
  portalOnly: number;
  suppressedByConsent: number;
  suppressedAsChild: number;
  sample: (string | null | undefined)[];
}

/**
 * `POST /api/audiences/preview` (§4.7). Builds the SAME
 * `Prisma.DataPrincipalWhereInput` a MARKETING/etc. campaign send would
 * (via `compileAudience`, imported unmodified -- spec line 752: "two
 * similar queries is the defect that makes previews lie") and reports
 * back exactly the shape the spec names: `{ total, withEmail, portalOnly,
 * suppressedByConsent, suppressedAsChild, sample }`.
 *
 * `suppressedByConsent` is computed against `PreviewAudienceDto.purposeId`
 * -- a DELIBERATELY SEPARATE knob from any `consent` rule that may
 * already appear inside `filter`. A `consent` rule in the DSL targets WHO
 * is in the audience (e.g. "only principals whose consent for purpose X
 * is UNKNOWN"); `purposeId` here previews what a MARKETING send built on
 * this same audience would additionally suppress under spec §4.8 guard 1
 * ("recipients are intersected with GRANTED consent for that purpose;
 * everyone else becomes SUPPRESSED") -- the two are independent because a
 * campaign's target purpose need not be the same purpose a `consent` rule
 * filters on (e.g. "target everyone who opted into SMS updates, then
 * check MARKETING consent before sending"). Omitting `purposeId` reports
 * `suppressedByConsent: 0` -- there is no marketing purpose to check
 * consent against, so nothing is known to be suppressed on that basis.
 *
 * `suppressedAsChild` counts `CHILD` AND `GUARDIAN_REPRESENTED` (task
 * brief's deliberate widening past the spec's literal pseudocode -- see
 * `CHILD_LIKE_AGE_STATUSES`'s doc comment).
 *
 * `portalOnly` = `total - withEmail`: per spec line 768 ("Portal-first:
 * someone with no email address still receives everything"), a
 * principal with no known EMAIL `PrincipalDataField` is reachable only
 * through the always-on `PortalProvider`, never through `SmtpProvider`.
 *
 * Every count query ANDs the compiled `where` onto a second, narrow
 * predicate rather than post-filtering an entire loaded audience in
 * memory -- e.g. `suppressedByConsent`'s predicate filters directly on
 * `ConsentRecord.purposeId`/`.status`, which is exactly
 * `@@index([organizationId, purposeId, status])`'s column order, per
 * Check 36's explicit hint (spec's 1.5s/12k-principal/40k-consent-record
 * budget). All five aggregate queries plus the ten-row sample run via
 * `Promise.all` rather than sequentially.
 */
@Injectable()
export class AudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masking: MaskingService,
  ) {}

  async preview(
    dto: PreviewAudienceDto,
    actorPermissions: ReadonlySet<string>,
  ): Promise<AudiencePreviewResult> {
    const where = this.compile(dto.filter);

    const withEmailWhere: Prisma.DataPrincipalWhereInput = {
      AND: [where, { fields: { some: { canonicalField: "EMAIL" } } }],
    };
    const suppressedAsChildWhere: Prisma.DataPrincipalWhereInput = {
      AND: [where, { ageStatus: { in: [...CHILD_LIKE_AGE_STATUSES] } }],
    };
    const suppressedByConsentWhere: Prisma.DataPrincipalWhereInput | null = dto.purposeId
      ? {
          AND: [
            where,
            {
              NOT: {
                consentRecords: {
                  some: { purposeId: dto.purposeId, status: "GRANTED" },
                },
              },
            },
          ],
        }
      : null;

    const [total, withEmail, suppressedAsChild, suppressedByConsent, sampleRows] =
      await Promise.all([
        this.prisma.scoped.dataPrincipal.count({ where }),
        this.prisma.scoped.dataPrincipal.count({ where: withEmailWhere }),
        this.prisma.scoped.dataPrincipal.count({ where: suppressedAsChildWhere }),
        suppressedByConsentWhere
          ? this.prisma.scoped.dataPrincipal.count({ where: suppressedByConsentWhere })
          : Promise.resolve(0),
        this.prisma.scoped.dataPrincipal.findMany({
          where,
          take: 10,
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          select: { displayName: true },
        }),
      ]);

    const sample = sampleRows.map((row) =>
      this.masking.maskIfNeeded(actorPermissions, "FULL_NAME", row.displayName),
    );

    return {
      total,
      withEmail,
      portalOnly: total - withEmail,
      suppressedByConsent,
      suppressedAsChild,
      sample,
    };
  }

  /** Maps `AudienceFilterError` to `BadRequestException` -- the ONE place
   * this project's HTTP status mapping happens, keeping `compileAudience`
   * itself framework-free per the spec/task brief. */
  private compile(filter: unknown): Prisma.DataPrincipalWhereInput {
    try {
      return compileAudience(filter as AudienceFilter);
    } catch (err) {
      if (err instanceof AudienceFilterError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
