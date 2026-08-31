import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { ChildExemptionsService } from "./child-exemptions.service";
import { CreateExemptionClaimDto } from "./dto/create-exemption-claim.dto";
import { ListExemptionClaimsDto } from "./dto/list-exemption-claims.dto";

@ApiTags("child-exemptions")
@Controller("child-exemptions")
export class ChildExemptionsController {
  constructor(private readonly childExemptionsService: ChildExemptionsService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  list(@Query() query: ListExemptionClaimsDto) {
    return this.childExemptionsService.list(query);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  create(
    @Body() dto: CreateExemptionClaimDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.childExemptionsService.create(dto, actor);
  }
}
