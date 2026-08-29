import { Injectable } from "@nestjs/common";
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
