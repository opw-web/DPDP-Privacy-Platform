import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { TransfersService } from "./transfers.service";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { UpdateTransferDto } from "./dto/update-transfer.dto";

@ApiTags("registers")
@Controller("registers/transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list() {
    return this.transfersService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  get(@Param("id") id: string) {
    return this.transfersService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_REGISTERS")
  create(@Body() dto: CreateTransferDto) {
    return this.transfersService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_REGISTERS")
  update(@Param("id") id: string, @Body() dto: UpdateTransferDto) {
    return this.transfersService.update(id, dto);
  }
}
