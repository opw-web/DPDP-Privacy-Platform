import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SecurityMeasuresService } from "./security-measures.service";
import { CreateSecurityMeasureDto } from "./dto/create-security-measure.dto";
import { UpdateSecurityMeasureDto } from "./dto/update-security-measure.dto";

/**
 * `GET /api/registers/security` returns measures GROUPED by
 * `ruleReference` with implemented counts (task brief) -- see
 * `SecurityMeasuresService.list()`'s `SecurityMeasureGroup[]`, not a
 * flat `SecurityMeasure[]`.
 */
@ApiTags("registers")
@Controller("registers/security")
export class SecurityMeasuresController {
  constructor(
    private readonly securityMeasuresService: SecurityMeasuresService,
  ) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.securityMeasuresService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get(@Param("id") id: string) {
    return this.securityMeasuresService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_REGISTERS")
  create(@Body() dto: CreateSecurityMeasureDto) {
    return this.securityMeasuresService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_REGISTERS")
  update(@Param("id") id: string, @Body() dto: UpdateSecurityMeasureDto) {
    return this.securityMeasuresService.update(id, dto);
  }
}
