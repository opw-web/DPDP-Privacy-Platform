import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

/**
 * The ONLY shape of `Employee` this service (or the controller behind it)
 * ever returns. `passwordHash` is credential material -- it must never
 * cross the trust boundary in an API response, the same discipline
 * `AuditService` already enforces for audit metadata and `me()` already
 * applies by hand-picking its response fields.
 *
 * A single shared constant, not four separate inline `select`s, so the
 * four call sites below cannot drift apart and re-open this hole one at a
 * time.
 */
export const EMPLOYEE_PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  roleId: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type PublicEmployee = Prisma.EmployeeGetPayload<{
  select: typeof EMPLOYEE_PUBLIC_SELECT;
}>;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicEmployee[]> {
    return this.prisma.scoped.employee.findMany({
      orderBy: { createdAt: "asc" },
      select: EMPLOYEE_PUBLIC_SELECT,
    });
  }

  async get(id: string): Promise<PublicEmployee> {
    return this.prisma.scoped.employee.findFirstOrThrow({
      where: { id },
      select: EMPLOYEE_PUBLIC_SELECT,
    });
  }

  /**
   * Constraint 3 (task 5 brief): `dto.roleId` is a caller-supplied foreign
   * id into a tenant-scoped model that has no organizationId column check
   * of its own from the Prisma extension (Employee.roleId is a plain
   * scalar FK on a DIRECT model, not one of the two indirect join tables
   * the extension verifies automatically). It is resolved through the
   * scoped `role` delegate BEFORE being used in the create -- a roleId
   * belonging to another organization throws P2025 here, never silently
   * attaches.
   */
  async create(dto: CreateEmployeeDto): Promise<PublicEmployee> {
    const role = await this.prisma.scoped.role.findFirstOrThrow({
      where: { id: dto.roleId },
    });
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    return this.prisma.scoped.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          email: dto.email,
          fullName: dto.fullName,
          roleId: role.id,
          passwordHash,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime; the generated Prisma type
          // still requires it at the type level (see
          // tenant-isolation.e2e-spec.ts for the same convention).
        } as never,
        select: EMPLOYEE_PUBLIC_SELECT,
      });
      await this.auditService.record(tx, {
        action: "EMPLOYEE_CREATED",
        resourceType: "Employee",
        resourceId: employee.id,
        metadata: { email: dto.email, fullName: dto.fullName, roleId: role.id },
      });
      return employee;
    });
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<PublicEmployee> {
    const existing = await this.prisma.scoped.employee.findFirstOrThrow({
      where: { id },
    });

    let newRoleId: string | undefined;
    if (dto.roleId !== undefined && dto.roleId !== existing.roleId) {
      // Same resolve-through-the-scoped-delegate idiom as `create` --
      // a role change is exactly as much a caller-supplied foreign id as
      // an employee create is.
      const role = await this.prisma.scoped.role.findFirstOrThrow({
        where: { id: dto.roleId },
      });
      newRoleId = role.id;
    }

    const becomingDisabled =
      dto.status === "DISABLED" && existing.status !== "DISABLED";

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          roleId: newRoleId,
          status: dto.status,
        },
        select: EMPLOYEE_PUBLIC_SELECT,
      });

      if (newRoleId) {
        await this.auditService.record(tx, {
          action: "EMPLOYEE_ROLE_CHANGED",
          resourceType: "Employee",
          resourceId: id,
          metadata: { fromRoleId: existing.roleId, toRoleId: newRoleId },
        });
      }

      if (becomingDisabled) {
        await this.auditService.record(tx, {
          action: "EMPLOYEE_DISABLED",
          resourceType: "Employee",
          resourceId: id,
          metadata: {},
        });
      }

      return updated;
    });
  }

  /**
   * Deliberately writes no audit event: the fixed `AuditAction` union
   * (Task 4, spec lines 880-891) has no action for "an employee's
   * password was reset by an admin," and the task-5 review ruled that
   * inventing one is out of scope here (same "transcribe exactly, don't
   * invent" discipline as the permission-catalogue and role-permission-
   * change gaps already flagged elsewhere in this module and in
   * roles.service.ts). This is a recorded spec gap, not an oversight --
   * do not "fix" it by adding a new AuditAction name.
   */
  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.prisma.scoped.employee.findFirstOrThrow({ where: { id } });
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    await this.prisma.scoped.employee.update({
      where: { id },
      data: { passwordHash },
    });
  }
}
