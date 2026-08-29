import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RolesService } from "./roles.service";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";

@ApiTags("roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  list() {
    return this.rolesService.list();
  }

  @Patch(":id/permissions")
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  replacePermissions(
    @Param("id") id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.replacePermissions(id, dto);
  }
}
