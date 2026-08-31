import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AgeStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { TenantScopedPrismaClient } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import { MaskingService } from "../../common/masking/masking.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { APPOINTING_AUTHORITIES } from "./appointing-authority";
import { CreateGuardianDto } from "./dto/create-guardian.dto";
import { VerifyGuardianDto } from "./dto/verify-guardian.dto";
import { ListGuardiansDto } from "./dto/list-guardians.dto";

/**
 * CH-01…CH-03: the two "child-like" `AgeStatus` values that require a
 * verified guardian before consent can be recorded on the principal's
 * behalf. `AgeStatus` has FOUR members (`UNKNOWN | ADULT | CHILD |
 * GUARDIAN_REPRESENTED`), not three -- `GUARDIAN_REPRESENTED` covers a
 * person with disability under a `LAWFUL_GUARDIAN_OF_PWD` relationship,
 * and s.9's guardian-consent protections apply to that case exactly as
 * much as to `CHILD`. Same convention Task 4's `CampaignService` audience
 * suppression already uses (`src/modules/messaging/audience/audience.service.ts`'s
 * `CHILD_LIKE_AGE_STATUSES`) -- kept as an independent local copy here
 * (this module owns no import path into `messaging/`), not re-exported
 * from there.
 */
const CHILD_LIKE_AGE_STATUSES: readonly AgeStatus[] = [
  "CHILD",
  "GUARDIAN_REPRESENTED",
];

/**
 * The ONLY shape of `GuardianRelationship` this service (or the
 * controller behind it) ever returns, before masking is applied to
 * `guardianEmail`/`guardianPhone`. Same discipline as
 * `PURPOSE_PUBLIC_SELECT` / `RECIPIENT_PUBLIC_SELECT`.
 */
export const GUARDIAN_PUBLIC_SELECT = {
  id: true,
  dataPrincipalId: true,
  kind: true,
  guardianName: true,
  guardianEmail: true,
  guardianPhone: true,
  verification: true,
  verificationReference: true,
  verifiedByEmployeeId: true,
  verifiedAt: true,
  appointingAuthority: true,
  appointmentReference: true,
  active: true,
  createdAt: true,
} satisfies Prisma.GuardianRelationshipSelect;

type GuardianRow = Prisma.GuardianRelationshipGetPayload<{
  select: typeof GUARDIAN_PUBLIC_SELECT;
}>;

export type PublicGuardian = GuardianRow;

export function toPublicGuardian(row: GuardianRow): PublicGuardian {
  return { ...row };
}

function isPwd(kind: string): boolean {
  return kind === "LAWFUL_GUARDIAN_OF_PWD";
}

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly maskingService: MaskingService,
  ) {}

  /**
   * Third-party personal data decision (guardian name/email/phone belong
   * to the guardian, not the data principal): `guardianEmail` and
   * `guardianPhone` follow the SAME SE-01 masking rule MVP 1 already
   * applies to a data principal's own contact fields
   * (`PrincipalsService` -- `MaskingService.maskIfNeeded` keyed on
   * `CAN_VIEW_ALL_PERSONAL_DATA`) rather than being exempted just because
   * they sit on a different model. `guardianName` is left unmasked
   * (mirrors `FULL_NAME` staying visible on the principal profile too --
   * only `EMAIL`/`PHONE` have a spec-defined masked format at all, per
   * `MaskingService`'s own doc comment). See this task's report for the
   * full reasoning.
   */
  private toResponse(
    row: GuardianRow,
    permissions: ReadonlySet<string>,
  ): PublicGuardian {
    const guardian = toPublicGuardian(row);
    return {
      ...guardian,
      guardianEmail:
        this.maskingService.maskIfNeeded(
          permissions,
          "EMAIL",
          guardian.guardianEmail,
        ) ?? null,
      guardianPhone:
        this.maskingService.maskIfNeeded(
          permissions,
          "PHONE",
          guardian.guardianPhone,
        ) ?? null,
    };
  }

  async list(
    query: ListGuardiansDto,
    permissions: ReadonlySet<string>,
  ): Promise<PublicGuardian[]> {
    const rows = await this.prisma.scoped.guardianRelationship.findMany({
      where: query.dataPrincipalId
        ? { dataPrincipalId: query.dataPrincipalId }
        : undefined,
      orderBy: { createdAt: "asc" },
      select: GUARDIAN_PUBLIC_SELECT,
    });
    return rows.map((row) => this.toResponse(row, permissions));
  }

  /**
   * Rule 11: a `LAWFUL_GUARDIAN_OF_PWD` relationship requires BOTH an
   * `appointingAuthority` drawn from the closed
   * `APPOINTING_AUTHORITIES` set AND a non-blank `appointmentReference`.
   * Re-checked here against the values about to be written -- not
   * trusted from whatever `@IsOptional()`/`@IsIn()` already caught on
   * `CreateGuardianDto` -- same discipline as
   * `PurposesService.validateBasis()`. Every message names the specific
   * missing field and cites "Rule 11" verbatim, which is what the e2e
   * suite asserts against.
   */
  private assertPwdAppointmentValid(
    kind: string,
    appointingAuthority: string | undefined,
    appointmentReference: string | undefined,
  ): void {
    if (!isPwd(kind)) {
      return;
    }
    if (!appointingAuthority || !APPOINTING_AUTHORITIES.includes(
      appointingAuthority as (typeof APPOINTING_AUTHORITIES)[number],
    )) {
      throw new BadRequestException(
        "appointingAuthority is required for a LAWFUL_GUARDIAN_OF_PWD " +
          `relationship and must be one of ${APPOINTING_AUTHORITIES.join(", ")} ` +
          "(Rule 11).",
      );
    }
    if (!appointmentReference || appointmentReference.trim().length === 0) {
      throw new BadRequestException(
        "appointmentReference is required for a LAWFUL_GUARDIAN_OF_PWD " +
          "relationship (Rule 11).",
      );
    }
  }

  async create(
    dto: CreateGuardianDto,
    permissions: ReadonlySet<string>,
  ): Promise<PublicGuardian> {
    this.assertPwdAppointmentValid(
      dto.kind,
      dto.appointingAuthority,
      dto.appointmentReference,
    );

    const principal = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id: dto.dataPrincipalId },
      select: { id: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dto.dataPrincipalId}" not found.`,
      );
    }

    const row = await this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.guardianRelationship.create({
        data: {
          dataPrincipalId: dto.dataPrincipalId,
          kind: dto.kind,
          guardianName: dto.guardianName,
          guardianEmail: dto.guardianEmail ?? null,
          guardianPhone: dto.guardianPhone ?? null,
          appointingAuthority: dto.appointingAuthority ?? null,
          appointmentReference: dto.appointmentReference ?? null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // RecipientsService.create / EmployeesService.create).
        } as never,
        select: GUARDIAN_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "GUARDIAN_REGISTERED",
        resourceType: "GuardianRelationship",
        resourceId: created.id,
        subjectPrincipalId: created.dataPrincipalId,
        metadata: { kind: created.kind, dataPrincipalId: created.dataPrincipalId },
      });

      return created;
    });

    return this.toResponse(row, permissions);
  }

  async verify(
    id: string,
    dto: VerifyGuardianDto,
    actor: AccessTokenPayload,
    permissions: ReadonlySet<string>,
  ): Promise<PublicGuardian> {
    if (dto.verification === "NONE") {
      throw new BadRequestException(
        "verification must be one of Rule 10's prescribed methods " +
          "(EXISTING_RELIABLE_DETAILS, SELF_PROVIDED_DETAILS, " +
          "VIRTUAL_TOKEN, DIGITAL_LOCKER, COURT_ORDER, DESIGNATED_AUTHORITY, " +
          "LOCAL_LEVEL_COMMITTEE) -- NONE means \"not yet verified\" and " +
          "cannot itself be the result of a verify call (Rule 10).",
      );
    }

    const existing = await this.prisma.scoped.guardianRelationship.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Guardian relationship "${id}" not found.`);
    }

    const row = await this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.guardianRelationship.update({
        where: { id },
        data: {
          verification: dto.verification,
          verificationReference: dto.verificationReference ?? null,
          verifiedByEmployeeId: actor.sub,
          verifiedAt: new Date(),
        },
        select: GUARDIAN_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "GUARDIAN_VERIFIED",
        resourceType: "GuardianRelationship",
        resourceId: updated.id,
        subjectPrincipalId: updated.dataPrincipalId,
        metadata: {
          verification: updated.verification,
          verifiedByEmployeeId: actor.sub,
        },
      });

      return updated;
    });

    return this.toResponse(row, permissions);
  }

  /**
   * ============================================================
   * PUBLISHED INTERFACE for Wave 3's consent task (see task-8-report.md
   * "Interfaces published"). Enforceable from OUTSIDE this module: any
   * other service can inject `GuardiansService` (this module exports it)
   * and call this before writing a `ConsentRecord`.
   *
   * Throws `BadRequestException` (quoting "Rule 10") when `ageStatus` is
   * `CHILD` or `GUARDIAN_REPRESENTED` and EITHER:
   *   - `guardianId` is null/undefined ("no guardian named"), OR
   *   - `guardianId` does not resolve to an ACTIVE `GuardianRelationship`
   *     belonging to THIS `dataPrincipalId` whose `verification` is not
   *     `NONE`.
   * Resolves silently (no-op) for `ADULT`/`UNKNOWN` principals regardless
   * of `guardianId`, and for a `CHILD`/`GUARDIAN_REPRESENTED` principal
   * whose named guardian passes all three checks.
   *
   * Throws `NotFoundException` if `dataPrincipalId` itself does not
   * resolve -- the caller should already know the principal exists
   * (it is presumably the same id its own request validated), but this
   * method does not assume that.
   *
   * `tx` defaults to `this.prisma.scoped` (same pattern as
   * `DataSourcesService.rescrubFieldSample`) so a caller composing this
   * check inside its OWN `prisma.scoped.$transaction(async (tx) => ...)`
   * can pass that `tx` through and get a single consistent read/write
   * view; a caller with no open transaction can call it with just the
   * first two arguments.
   * ============================================================
   */
  async assertGuardianConsentEligible(
    dataPrincipalId: string,
    guardianId: string | null | undefined,
    tx: ScopedTransactionClient | TenantScopedPrismaClient = this.prisma.scoped,
  ): Promise<void> {
    const principal = await tx.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true, ageStatus: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }
    if (!CHILD_LIKE_AGE_STATUSES.includes(principal.ageStatus)) {
      return;
    }

    if (!guardianId) {
      throw new BadRequestException(
        "givenByGuardianId is required to grant consent for a CHILD or " +
          "GUARDIAN_REPRESENTED data principal, naming an active, " +
          "verified GuardianRelationship (Rule 10).",
      );
    }

    const guardian = await tx.guardianRelationship.findFirst({
      where: { id: guardianId, dataPrincipalId },
      select: { active: true, verification: true },
    });
    if (!guardian || !guardian.active || guardian.verification === "NONE") {
      throw new BadRequestException(
        "givenByGuardianId must name an active GuardianRelationship for " +
          "this data principal whose verification is not NONE -- Rule 10 " +
          "requires verifiable consent through one of the prescribed " +
          "methods (reliable identity/age details already held, details " +
          "voluntarily provided, a virtual token from an authorised " +
          "entity, or a Digital Locker reference) before a guardian may " +
          "consent on a child's behalf.",
      );
    }
  }
}
