import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PrismaService } from "../../common/prisma/prisma.service";

@ApiTags("permissions")
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `Permission` is the one model the tenant extension deliberately leaves
   * global (no organizationId column, shared catalog across every
   * organization) -- `prisma.scoped.permission` passes straight through
   * unfiltered.
   */
  @Get()
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  list() {
    return this.prisma.scoped.permission.findMany({
      orderBy: { code: "asc" },
    });
  }
}
