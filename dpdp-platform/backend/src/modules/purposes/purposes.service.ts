import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { LawfulBasis, LegitimateUseLimb } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { CreatePurposeDto } from "./dto/create-purpose.dto";
import { UpdatePurposeDto } from "./dto/update-purpose.dto";

/**
 * The ONLY shape of `ProcessingPurpose` this service (or the controller
 * behind it) ever returns. Same discipline as `EMPLOYEE_PUBLIC_SELECT` in
 * `employees.service.ts` -- one shared constant so the four call sites
 * below cannot drift apart.
 */
export const PURPOSE_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  lawfulBasis: true,
  legitimateUseLimb: true,
  basisJustification: true,
  dataCategories: true,
  goodsOrServicesDescription: true,
  reviewedByEmployeeId: true,
  reviewedAt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProcessingPurposeSelect;

type PurposeRow = Prisma.ProcessingPurposeGetPayload<{
  select: typeof PURPOSE_PUBLIC_SELECT;
}>;

/**
 * The response shape Tasks 13, 21, 25 and 28 consume: the raw row plus a
 * derived `isReviewed` boolean, so the UI never has to recompute "was
 * `reviewedByEmployeeId` set" itself.
 */
export type PublicPurpose = PurposeRow & { isReviewed: boolean };

function toPublicPurpose(row: PurposeRow): PublicPurpose {
  return { ...row, isReviewed: row.reviewedByEmployeeId !== null };
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

@Injectable()
export class PurposesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicPurpose[]> {
    const rows = await this.prisma.scoped.processingPurpose.findMany({
      orderBy: { createdAt: "asc" },
      select: PURPOSE_PUBLIC_SELECT,
    });
    return rows.map(toPublicPurpose);
  }

  /**
   * The single authoritative enforcement point for LB-01/LB-02/CN-02's
   * three hard rules. This is checked here -- against the values about to
   * be written -- regardless of what any DTO decorator already caught,
   * so a future refactor that loosens or removes a `@IsEnum`/`@IsString`
   * decorator cannot silently reopen the hole: this method has no
   * knowledge of, and does not trust, whatever validation ran upstream.
   *
   * Every message names the exact field under test, on purpose -- so a
   * test asserting "missing lawfulBasis returns 400 whose message
   * mentions lawfulBasis" cannot pass because some unrelated field (e.g.
   * a missing `name`) happened to fail validation first.
   */
  private validateBasis(
    lawfulBasis: LawfulBasis | null | undefined,
    legitimateUseLimb: LegitimateUseLimb | null | undefined,
    basisJustification: string | null | undefined,
  ): void {
    if (!lawfulBasis) {
      throw new BadRequestException(
        "lawfulBasis is required. It has no default and is never " +
          "inferred from a data source, table, or column name (LB-02).",
      );
    }
    if (lawfulBasis === "LEGITIMATE_USE" && !legitimateUseLimb) {
      throw new BadRequestException(
        "legitimateUseLimb is required when lawfulBasis is " +
          "LEGITIMATE_USE (the s.7(a)-(i) limb).",
      );
    }
    if (lawfulBasis === "CONSENT" && legitimateUseLimb) {
      throw new BadRequestException(
        "legitimateUseLimb must not be supplied when lawfulBasis is " +
          "CONSENT -- a consent purpose has no s.7 limb.",
      );
    }
    if (!basisJustification || basisJustification.trim().length === 0) {
      throw new BadRequestException(
        "basisJustification is required and cannot be blank or " +
          "whitespace-only free text written by a human.",
      );
    }
  }

  /**
   * Constraint carried from Task 5/7: `code` uniqueness is org-scoped via
   * `@@unique([organizationId, code])`. Pre-checked here for a clean 409
   * on the common path, and re-caught as P2002 below for the race case --
   * there is no `PrismaClientKnownRequestError` -> HTTP filter in this
   * codebase, so an uncaught P2002 would otherwise surface as a 500.
   */
  async create(dto: CreatePurposeDto): Promise<PublicPurpose> {
    this.validateBasis(
      dto.lawfulBasis,
      dto.legitimateUseLimb,
      dto.basisJustification,
    );

    const existing = await this.prisma.scoped.processingPurpose.findFirst({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `A purpose with code "${dto.code}" already exists in this organization.`,
      );
    }

    const legitimateUseLimb =
      dto.lawfulBasis === "LEGITIMATE_USE" ? dto.legitimateUseLimb! : null;

    return this.prisma.scoped.$transaction(async (tx) => {
      let created: PurposeRow;
      try {
        created = await tx.processingPurpose.create({
          data: {
            code: dto.code,
            name: dto.name,
            description: dto.description,
            lawfulBasis: dto.lawfulBasis,
            legitimateUseLimb,
            basisJustification: dto.basisJustification,
            dataCategories: dto.dataCategories ?? [],
            goodsOrServicesDescription: dto.goodsOrServicesDescription,
          } as never,
          select: PURPOSE_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(
            `A purpose with code "${dto.code}" already exists in this organization.`,
          );
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "PURPOSE_CREATED",
        resourceType: "ProcessingPurpose",
        resourceId: created.id,
        metadata: {
          code: created.code,
          name: created.name,
          lawfulBasis: created.lawfulBasis,
          legitimateUseLimb: created.legitimateUseLimb,
          dataCategories: created.dataCategories,
        },
      });

      return toPublicPurpose(created);
    });
  }

  async update(id: string, dto: UpdatePurposeDto): Promise<PublicPurpose> {
    const existing = await this.prisma.scoped.processingPurpose.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Processing purpose "${id}" not found.`);
    }

    const effectiveLawfulBasis: LawfulBasis =
      dto.lawfulBasis ?? existing.lawfulBasis;
    const effectiveLimb: LegitimateUseLimb | null =
      dto.legitimateUseLimb !== undefined
        ? dto.legitimateUseLimb
        : existing.legitimateUseLimb;
    const effectiveJustification =
      dto.basisJustification ?? existing.basisJustification;

    this.validateBasis(
      effectiveLawfulBasis,
      effectiveLimb,
      effectiveJustification,
    );

    const legitimateUseLimb =
      effectiveLawfulBasis === "LEGITIMATE_USE" ? effectiveLimb : null;

    return this.prisma.scoped.$transaction(async (tx) => {
      let updated: PurposeRow;
      try {
        updated = await tx.processingPurpose.update({
          where: { id },
          data: {
            name: dto.name,
            description: dto.description,
            lawfulBasis: dto.lawfulBasis,
            legitimateUseLimb,
            basisJustification: dto.basisJustification,
            dataCategories: dto.dataCategories,
            goodsOrServicesDescription: dto.goodsOrServicesDescription,
            active: dto.active,
          },
          select: PURPOSE_PUBLIC_SELECT,
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err)) {
          throw new ConflictException(
            `A purpose with code "${existing.code}" already exists in this organization.`,
          );
        }
        throw err;
      }

      await this.auditService.record(tx, {
        action: "PURPOSE_UPDATED",
        resourceType: "ProcessingPurpose",
        resourceId: id,
        metadata: {
          lawfulBasis: updated.lawfulBasis,
          legitimateUseLimb: updated.legitimateUseLimb,
          dataCategories: updated.dataCategories,
        },
      });

      return toPublicPurpose(updated);
    });
  }

  /**
   * `reviewedByEmployeeId` and `reviewedAt` come from the verified access
   * token (`actor.sub`) and the server clock ONLY -- never from the
   * request body, which carries no fields for either. There is nothing
   * in `PurposesController.review()`'s signature a caller could populate
   * to spoof a reviewer.
   */
  async review(id: string, actor: AccessTokenPayload): Promise<PublicPurpose> {
    const existing = await this.prisma.scoped.processingPurpose.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Processing purpose "${id}" not found.`);
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const updated = await tx.processingPurpose.update({
        where: { id },
        data: {
          reviewedByEmployeeId: actor.sub,
          reviewedAt,
        },
        select: PURPOSE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "PURPOSE_REVIEWED",
        resourceType: "ProcessingPurpose",
        resourceId: id,
        metadata: {
          reviewedByEmployeeId: updated.reviewedByEmployeeId,
          reviewedAt,
        },
      });

      return toPublicPurpose(updated);
    });
  }
}
