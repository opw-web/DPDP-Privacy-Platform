import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { InformationRequestsService } from "./information-requests.service";
import { CreateInformationRequestDto } from "./dto/create-information-request.dto";
import { UpdateInformationRequestDto } from "./dto/update-information-request.dto";

/**
 * Spec line 886, verbatim: `GET|POST|PATCH /api/information-requests`,
 * `CAN_CHANGE_COMPLIANCE_CONFIG`.
 */
@ApiTags("information-requests")
@Controller("information-requests")
export class InformationRequestsController {
  constructor(private readonly service: InformationRequestsService) {}

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
  create(@Body() dto: CreateInformationRequestDto) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_CHANGE_COMPLIANCE_CONFIG")
  update(@Param("id") id: string, @Body() dto: UpdateInformationRequestDto) {
    return this.service.update(id, dto);
  }
}
