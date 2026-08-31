import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import { CurrentActorPermissions } from "../../common/decorators/current-actor-permissions.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { GuardiansService } from "./guardians.service";
import { CreateGuardianDto } from "./dto/create-guardian.dto";
import { VerifyGuardianDto } from "./dto/verify-guardian.dto";
import { ListGuardiansDto } from "./dto/list-guardians.dto";

@ApiTags("guardians")
@Controller("guardians")
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  list(
    @Query() query: ListGuardiansDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.guardiansService.list(query, permissions);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  create(
    @Body() dto: CreateGuardianDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.guardiansService.create(dto, permissions);
  }

  @Post(":id/verify")
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  verify(
    @Param("id") id: string,
    @Body() dto: VerifyGuardianDto,
    @CurrentActor() actor: AccessTokenPayload,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.guardiansService.verify(id, dto, actor, permissions);
  }
}
