import { BadRequestException, Injectable } from "@nestjs/common";
import type { Role } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list() {
    return this.prisma.scoped.role.findMany({
      include: { permissions: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * `id` is already resolved and tenant-verified by `findFirstOrThrow`
   * below -- a role id belonging to another organization throws P2025
   * before any write is attempted.
   *
   * Task 5 review fixes (Minor):
   *  - `dto.permissionCodes` is validated against the global `Permission`
   *    catalogue BEFORE the destructive `deleteMany` runs. An unknown code
   *    used to reach the `RolePermission` FK constraint after the delete
   *    had already happened -- the transaction still rolled back cleanly,
   *    but the caller got an unhandled 500 for what is really a 400
   *    (bad request body), not a server fault.
   *  - The five seeded system roles (`isSystem: true`) can no longer have
   *    their permission set rewritten through this endpoint -- the flag
   *    was seeded but never enforced.
   *
   * Replaces the role's permission set with exactly `permissionCodes`.
   * `RolePermission` create is looped as single `create` calls, not
   * `createMany`, per tenant.extension.ts's documented caveat: only the
   * single-row `create` override is transaction-aware for indirect
   * models' foreign-key ownership check (`createMany` inside a
   * transaction can spuriously reject a parent written earlier in the
   * SAME transaction).
   */
  async replacePermissions(
    id: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<Role> {
    const role = await this.prisma.scoped.role.findFirstOrThrow({
      where: { id },
    });

    if (role.isSystem) {
      throw new BadRequestException(
        `Role "${role.code}" is a system role -- its permission set is fixed by the seed and cannot be edited.`,
      );
    }

    if (dto.permissionCodes.length > 0) {
      const knownPermissions = await this.prisma.permission.findMany({
        where: { code: { in: dto.permissionCodes } },
        select: { code: true },
      });
      const knownCodes = new Set(knownPermissions.map((p) => p.code));
      const unknownCodes = dto.permissionCodes.filter(
        (code) => !knownCodes.has(code),
      );
      if (unknownCodes.length > 0) {
        throw new BadRequestException(
          `Unknown permission code(s): ${unknownCodes.join(", ")}`,
        );
      }
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const permissionCode of dto.permissionCodes) {
        await tx.rolePermission.create({
          data: { roleId: role.id, permissionCode },
        });
      }
      // NOTE: the fixed AuditAction union (Task 4, spec lines 880-891) has
      // no action specifically for "a role's permission set changed" --
      // only EMPLOYEE_ROLE_CHANGED ("an EMPLOYEE's roleId changed") and
      // ORG_SETTINGS_UPDATED exist near this. Per the "use the exact
      // names, never invent one" constraint, ORG_SETTINGS_UPDATED (the
      // closest fit -- this IS an organizational RBAC configuration
      // change) is used here instead of adding a new action name.
      // Flagged for the spec owner, same as the two other transcription
      // gaps already recorded in audit-actions.ts.
      await this.auditService.record(tx, {
        action: "ORG_SETTINGS_UPDATED",
        resourceType: "Role",
        resourceId: role.id,
        metadata: { permissionCodes: dto.permissionCodes },
      });
      return tx.role.findFirstOrThrow({ where: { id: role.id } });
    });
  }
}
