import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RetentionService } from "./retention.service";
import { CreateRetentionPolicyDto } from "./dto/create-retention-policy.dto";
import { UpdateRetentionPolicyDto } from "./dto/update-retention-policy.dto";

@ApiTags("registers")
@Controller("registers/retention")
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.retentionService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get(@Param("id") id: string) {
    return this.retentionService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_REGISTERS")
  create(@Body() dto: CreateRetentionPolicyDto) {
    return this.retentionService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_REGISTERS")
  update(@Param("id") id: string, @Body() dto: UpdateRetentionPolicyDto) {
    return this.retentionService.update(id, dto);
  }
}
