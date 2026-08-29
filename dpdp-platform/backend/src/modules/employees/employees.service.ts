import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import type { Employee } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<Employee[]> {
    return this.prisma.scoped.employee.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  async get(id: string): Promise<Employee> {
    return this.prisma.scoped.employee.findFirstOrThrow({ where: { id } });
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
  async create(dto: CreateEmployeeDto): Promise<Employee> {
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

  async update(id: string, dto: UpdateEmployeeDto): Promise<Employee> {
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
