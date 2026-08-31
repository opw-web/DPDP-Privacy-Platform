import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SharingService } from "./sharing.service";
import { CreateSharingActivityDto } from "./dto/create-sharing-activity.dto";
import { UpdateSharingActivityDto } from "./dto/update-sharing-activity.dto";

@ApiTags("registers")
@Controller("registers/sharing")
export class SharingController {
  constructor(private readonly sharingService: SharingService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.sharingService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get(@Param("id") id: string) {
    return this.sharingService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_REGISTERS")
  create(@Body() dto: CreateSharingActivityDto) {
    return this.sharingService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_REGISTERS")
  update(@Param("id") id: string, @Body() dto: UpdateSharingActivityDto) {
    return this.sharingService.update(id, dto);
  }
}
