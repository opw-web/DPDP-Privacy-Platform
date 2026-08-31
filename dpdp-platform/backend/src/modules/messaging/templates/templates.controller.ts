import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { TemplatesService } from "./templates.service";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { UpdateTemplateDto } from "./dto/update-template.dto";
import { PreviewTemplateDto } from "./dto/preview-template.dto";

/**
 * Every route here is `CAN_SEND_MESSAGES`, per
 * DPDP_MVP2_COMPLIANCE_OPERATIONS.md lines 865-866:
 * `GET|POST|PATCH /api/templates[/:id]` and
 * `POST /api/templates/:id/preview`.
 */
@ApiTags("templates")
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @RequirePermission("CAN_SEND_MESSAGES")
  list() {
    return this.templatesService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_SEND_MESSAGES")
  get(@Param("id") id: string) {
    return this.templatesService.get(id);
  }

  @Post()
  @RequirePermission("CAN_SEND_MESSAGES")
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_SEND_MESSAGES")
  update(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Post(":id/preview")
  @RequirePermission("CAN_SEND_MESSAGES")
  preview(@Param("id") id: string, @Body() dto: PreviewTemplateDto) {
    return this.templatesService.preview(id, dto);
  }
}
