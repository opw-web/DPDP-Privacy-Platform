import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { RecipientsService } from "./recipients.service";
import { CreateRecipientDto } from "./dto/create-recipient.dto";
import { UpdateRecipientDto } from "./dto/update-recipient.dto";

/**
 * Spec lines 813-817: reads are `CAN_VIEW_PRINCIPALS`, writes are
 * `CAN_MANAGE_REGISTERS`. There is deliberately no `DELETE` -- a
 * compliance register is amended (PATCH), never erased (task brief).
 */
@ApiTags("registers")
@Controller("registers/recipients")
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.recipientsService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get(@Param("id") id: string) {
    return this.recipientsService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_REGISTERS")
  create(@Body() dto: CreateRecipientDto) {
    return this.recipientsService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_REGISTERS")
  update(@Param("id") id: string, @Body() dto: UpdateRecipientDto) {
    return this.recipientsService.update(id, dto);
  }
}
