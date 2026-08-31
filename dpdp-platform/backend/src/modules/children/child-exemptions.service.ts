import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { CreateExemptionClaimDto } from "./dto/create-exemption-claim.dto";
import { ListExemptionClaimsDto } from "./dto/list-exemption-claims.dto";

export const EXEMPTION_CLAIM_PUBLIC_SELECT = {
  id: true,
  purposeId: true,
  schedulePart: true,
  scheduleRow: true,
  conditionText: true,
  justification: true,
  claimedByEmployeeId: true,
  claimedAt: true,
  reviewedByEmployeeId: true,
  reviewedAt: true,
} satisfies Prisma.ChildExemptionClaimSelect;

type ExemptionClaimRow = Prisma.ChildExemptionClaimGetPayload<{
  select: typeof EXEMPTION_CLAIM_PUBLIC_SELECT;
}>;

export type PublicExemptionClaim = ExemptionClaimRow;

export function toPublicExemptionClaim(
  row: ExemptionClaimRow,
): PublicExemptionClaim {
  return { ...row };
}

/**
 * CH-06/CH-07: `ChildExemptionClaim` never accepts free-text
 * ("we think this is exempt") in place of an actual Schedule citation.
 * `CreateExemptionClaimDto`'s `@IsIn`/`@IsInt`/`@MinLength` decorators
 * are the pipe-layer's first line of defence; this method re-checks the
 * same four fields against the values about to be written -- the
 * discipline `PurposesService.validateBasis()` and
 * `GuardiansService.assertPwdAppointmentValid()` both already follow --
 * so a later decorator removal cannot silently reopen "we think this is
 * exempt" as an accepted claim.
 */
@Injectable()
export class ChildExemptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private assertClaimComplete(dto: CreateExemptionClaimDto): void {
    if (!dto.schedulePart || dto.schedulePart.trim().length === 0) {
      throw new BadRequestException(
        'schedulePart is required (Fourth Schedule Part A/B) -- a ' +
          '"we think this is exempt" claim with no cited Schedule part is ' +
          "not accepted (CH-06, CH-07).",
      );
    }
    if (!Number.isInteger(dto.scheduleRow) || dto.scheduleRow < 1) {
      throw new BadRequestException(
        "scheduleRow is required and must be a positive integer naming " +
          "the row within the Schedule part (CH-06, CH-07).",
      );
    }
    if (!dto.conditionText || dto.conditionText.trim().length === 0) {
      throw new BadRequestException(
        "conditionText is required -- the condition text pasted verbatim " +
          "from the Fourth Schedule, not free text (CH-06, CH-07).",
      );
    }
    if (!dto.justification || dto.justification.trim().length === 0) {
      throw new BadRequestException(
        "justification is required and cannot be blank (CH-06, CH-07).",
      );
    }
  }

  async list(query: ListExemptionClaimsDto): Promise<PublicExemptionClaim[]> {
    const rows = await this.prisma.scoped.childExemptionClaim.findMany({
      where: query.purposeId ? { purposeId: query.purposeId } : undefined,
      orderBy: { claimedAt: "asc" },
      select: EXEMPTION_CLAIM_PUBLIC_SELECT,
    });
    return rows.map(toPublicExemptionClaim);
  }

  async create(
    dto: CreateExemptionClaimDto,
    actor: AccessTokenPayload,
  ): Promise<PublicExemptionClaim> {
    this.assertClaimComplete(dto);

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.childExemptionClaim.create({
        data: {
          purposeId: dto.purposeId,
          schedulePart: dto.schedulePart,
          scheduleRow: dto.scheduleRow,
          conditionText: dto.conditionText,
          justification: dto.justification,
          claimedByEmployeeId: actor.sub,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // RecipientsService.create / EmployeesService.create).
        } as never,
        select: EXEMPTION_CLAIM_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "CHILD_EXEMPTION_CLAIMED",
        resourceType: "ChildExemptionClaim",
        resourceId: created.id,
        metadata: {
          purposeId: created.purposeId,
          schedulePart: created.schedulePart,
          scheduleRow: created.scheduleRow,
        },
      });

      return toPublicExemptionClaim(created);
    });
  }
}
