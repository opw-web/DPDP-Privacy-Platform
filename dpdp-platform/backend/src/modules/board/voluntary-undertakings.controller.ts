import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { VoluntaryUndertakingsService } from "./voluntary-undertakings.service";
import { CreateVoluntaryUndertakingDto } from "./dto/create-voluntary-undertaking.dto";
import { UpdateVoluntaryUndertakingDto } from "./dto/update-voluntary-undertaking.dto";

/**
 * `GET|POST|PATCH /api/voluntary-undertakings` -- not enumerated in the
 * spec's §4.13 endpoint table (see `VoluntaryUndertakingsService`'s doc
 * comment); exposed under the same `CAN_CHANGE_COMPLIANCE_CONFIG`
 * permission the spec DOES name for this task's Board/Government surface
 * (`/api/information-requests`), so BD-06 has a real API surface without
 * inventing a new permission.
 */
@ApiTags("voluntary-undertakings")
@Controller("voluntary-undertakings")
export class VoluntaryUndertakingsController {
  constructor(private readonly service: VoluntaryUndertakingsService) {}

  @Get()
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  list() {
    return this.service.list();
  }

  @Get(":id")
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  getById(@Param("id") id: string) {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  create(@Body() dto: CreateVoluntaryUndertakingDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  update(@Param("id") id: string, @Body() dto: UpdateVoluntaryUndertakingDto) {
    return this.service.update(id, dto);
  }
}
