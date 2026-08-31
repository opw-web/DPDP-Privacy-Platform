import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

@ApiTags("organization")
@Controller("organization")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get() {
    return this.organizationsService.get();
  }

  @Patch()
  @RequirePermission("CAN_CHANGE_ORG_SETTINGS")
  update(@Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(dto);
  }
}
