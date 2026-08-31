import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { PurposesService } from "./purposes.service";
import { CreatePurposeDto } from "./dto/create-purpose.dto";
import { UpdatePurposeDto } from "./dto/update-purpose.dto";

@ApiTags("purposes")
@Controller("purposes")
export class PurposesController {
  constructor(private readonly purposesService: PurposesService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.purposesService.list();
  }

  @Post()
  @RequirePermission("CAN_MANAGE_PURPOSES")
  create(@Body() dto: CreatePurposeDto) {
    return this.purposesService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_PURPOSES")
  update(@Param("id") id: string, @Body() dto: UpdatePurposeDto) {
    return this.purposesService.update(id, dto);
  }

  @Post(":id/review")
  @RequirePermission("CAN_MANAGE_PURPOSES")
  review(@Param("id") id: string, @CurrentActor() actor: AccessTokenPayload) {
    return this.purposesService.review(id, actor);
  }
}
