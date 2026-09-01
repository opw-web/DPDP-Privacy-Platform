import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { allocateCounterValue } from "../../common/reference/counter";
import { TenantContext } from "../../common/tenant/tenant-context";
import { CreateInformationRequestDto } from "./dto/create-information-request.dto";
import { UpdateInformationRequestDto } from "./dto/update-information-request.dto";

/** `Counter` name this service allocates `InformationRequest.reference`
 * from -- spec's "Add Counter names: REQUEST, CAMPAIGN, BREACH,
 * INFO_REQUEST", the fourth of the four. */
const INFO_REQUEST_REFERENCE_COUNTER = "INFO_REQUEST";
const INFO_REQUEST_REFERENCE_DIGITS = 6;

/** Rule 23(2)'s citation, quoted in the one rejection this service can
 * produce: a non-disclosure direction recorded with no authorisation
 * reference. */
export const RULE_23_NON_DISCLOSURE_CITATION =
  "DPDP Rules, 2025 -- Rule 23(2): where the Central Government directs " +
  "that information or a class of information shall not be disclosed by " +
  "a Data Fiduciary to a Data Principal, the direction and its " +
  "authorisation must be recorded.";

export const INFORMATION_REQUEST_PUBLIC_SELECT = {
  id: true,
  reference: true,
  requestingBody: true,
  authorisedPersonRef: true,
  purposeCited: true,
  receivedAt: true,
  responseDueAt: true,
  nonDisclosureDirected: true,
  nonDisclosurePermissionRef: true,
  affectedPrincipalIds: true,
  respondedAt: true,
  responseReference: true,
  createdAt: true,
} satisfies Prisma.InformationRequestSelect;

export type PublicInformationRequest = Prisma.InformationRequestGetPayload<{
  select: typeof INFORMATION_REQUEST_PUBLIC_SELECT;
}>;

/**
 * `InformationRequest` CRUD (BD-01...BD-04, Rule 23 + Seventh Schedule).
 * Every write here is the FIRST half of BD-04's two-part guarantee --
 * "internal accountability" -- recording who asked, under what
 * authority, and (when applicable) the non-disclosure direction's own
 * authorisation reference, via `INFORMATION_REQUEST_RECORDED`. The
 * SECOND half -- external non-disclosure actually being enforced at read
 * time (her portal, her access report, her evidence file, a campaign
 * send) -- is deliberately NOT this service's job: it belongs to
 * whichever surface reads this table when serving her, using the query
 * shape and audit call documented in `./non-disclosure.ts`. Conflating
 * the two would let this service's own internal-record write be
 * mistaken for the suppression itself.
 */
@Injectable()
export class InformationRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicInformationRequest[]> {
    return this.prisma.scoped.informationRequest.findMany({
      orderBy: { receivedAt: "desc" },
      select: INFORMATION_REQUEST_PUBLIC_SELECT,
    });
  }

  async getById(id: string): Promise<PublicInformationRequest> {
    const row = await this.prisma.scoped.informationRequest.findFirst({
      where: { id },
      select: INFORMATION_REQUEST_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Information request "${id}" not found.`);
    }
    return row;
  }

  /**
   * Rule 23(2): a non-disclosure direction is recorded with its
   * authorisation reference, or not recorded as a direction at all.
   * Enforced HERE against the effective payload -- not a conditional DTO
   * validator (see `CreateInformationRequestDto`'s doc comment) -- so the
   * citation reaches the rejection body.
   */
  private assertDirectionHasAuthorisation(
    nonDisclosureDirected: boolean,
    nonDisclosurePermissionRef: string | null | undefined,
  ): void {
    if (nonDisclosureDirected && (!nonDisclosurePermissionRef || nonDisclosurePermissionRef.trim().length === 0)) {
      throw new BadRequestException(
        "A non-disclosure direction requires nonDisclosurePermissionRef " +
          `(its authorisation reference). ${RULE_23_NON_DISCLOSURE_CITATION}`,
      );
    }
  }

  /**
   * `affectedPrincipalIds` is intentionally a scalar array in the schema,
   * so the service must enforce the referential/tenant invariant before it
   * can be used for non-disclosure suppression. The scoped delegate filters
   * by the current organization; an unknown or foreign id therefore gets
   * the same generic 400 and is never persisted.
   */
  private assertAffectedPrincipals(
    ids: readonly string[],
    rows: readonly { id: string }[],
  ): void {
    if (ids.length === 0) return;
    const found = new Set(rows.map((row) => row.id));
    const invalid = ids.filter((id) => !found.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        "affectedPrincipalIds contains an unknown principal for the current organization.",
      );
    }
  }

  async create(dto: CreateInformationRequestDto): Promise<PublicInformationRequest> {
    const nonDisclosureDirected = dto.nonDisclosureDirected ?? false;
    this.assertDirectionHasAuthorisation(nonDisclosureDirected, dto.nonDisclosurePermissionRef);

    const affectedPrincipalIds = dto.affectedPrincipalIds ?? [];

    return this.prisma.scoped.$transaction(async (tx) => {
      const principalRowsInTransaction = await tx.dataPrincipal.findMany({
        where: { id: { in: [...affectedPrincipalIds] } },
        select: { id: true },
      });
      this.assertAffectedPrincipals(affectedPrincipalIds, principalRowsInTransaction);
      const referenceValue = await allocateCounterValue(
        tx,
        TenantContext.get().organizationId,
        INFO_REQUEST_REFERENCE_COUNTER,
      );
      const reference = `IR-${referenceValue.toString().padStart(INFO_REQUEST_REFERENCE_DIGITS, "0")}`;
      const created = await tx.informationRequest.create({
        data: {
          reference,
          requestingBody: dto.requestingBody,
          authorisedPersonRef: dto.authorisedPersonRef,
          purposeCited: dto.purposeCited,
          receivedAt: new Date(dto.receivedAt),
          responseDueAt: new Date(dto.responseDueAt),
          nonDisclosureDirected,
          nonDisclosurePermissionRef: dto.nonDisclosurePermissionRef ?? null,
          affectedPrincipalIds,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // RecipientsService.create).
        } as never,
        select: INFORMATION_REQUEST_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "INFORMATION_REQUEST_RECORDED",
        resourceType: "InformationRequest",
        resourceId: created.id,
        metadata: {
          change: "CREATED",
          reference: created.reference,
          requestingBody: created.requestingBody,
          nonDisclosureDirected: created.nonDisclosureDirected,
          authorisationRef: created.nonDisclosurePermissionRef ?? "",
          affectedPrincipalCount: created.affectedPrincipalIds.length,
        },
      });

      return created;
    });
  }

  async update(id: string, dto: UpdateInformationRequestDto): Promise<PublicInformationRequest> {
    const existing = await this.prisma.scoped.informationRequest.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Information request "${id}" not found.`);
    }

    const effectiveNonDisclosureDirected =
      dto.nonDisclosureDirected ?? existing.nonDisclosureDirected;
    const effectiveNonDisclosurePermissionRef =
      dto.nonDisclosurePermissionRef !== undefined
        ? dto.nonDisclosurePermissionRef
        : existing.nonDisclosurePermissionRef;
    this.assertDirectionHasAuthorisation(
      effectiveNonDisclosureDirected,
      effectiveNonDisclosurePermissionRef,
    );

    const affectedPrincipalIds =
      dto.affectedPrincipalIds ?? existing.affectedPrincipalIds;
    const principalRows = await this.prisma.scoped.dataPrincipal.findMany({
      where: { id: { in: [...affectedPrincipalIds] } },
      select: { id: true },
    });
    this.assertAffectedPrincipals(affectedPrincipalIds, principalRows);

    return this.prisma.scoped.$transaction(async (tx) => {
      const principalRowsInTransaction = await tx.dataPrincipal.findMany({
        where: { id: { in: [...affectedPrincipalIds] } },
        select: { id: true },
      });
      this.assertAffectedPrincipals(affectedPrincipalIds, principalRowsInTransaction);
      const updated = await tx.informationRequest.update({
        where: { id },
        data: {
          requestingBody: dto.requestingBody ?? existing.requestingBody,
          authorisedPersonRef: dto.authorisedPersonRef ?? existing.authorisedPersonRef,
          purposeCited: dto.purposeCited ?? existing.purposeCited,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : existing.receivedAt,
          responseDueAt: dto.responseDueAt ? new Date(dto.responseDueAt) : existing.responseDueAt,
          nonDisclosureDirected: effectiveNonDisclosureDirected,
          nonDisclosurePermissionRef: effectiveNonDisclosurePermissionRef,
          affectedPrincipalIds,
          respondedAt: dto.respondedAt ? new Date(dto.respondedAt) : existing.respondedAt,
          responseReference:
            dto.responseReference !== undefined ? dto.responseReference : existing.responseReference,
        },
        select: INFORMATION_REQUEST_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "INFORMATION_REQUEST_RECORDED",
        resourceType: "InformationRequest",
        resourceId: id,
        metadata: {
          change: "UPDATED",
          reference: updated.reference,
          nonDisclosureDirected: updated.nonDisclosureDirected,
          authorisationRef: updated.nonDisclosurePermissionRef ?? "",
          affectedPrincipalCount: updated.affectedPrincipalIds.length,
          respondedAt: updated.respondedAt,
        },
      });

      return updated;
    });
  }
}
