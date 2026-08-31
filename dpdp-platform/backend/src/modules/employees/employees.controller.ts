import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { ResetEmployeePasswordDto } from "./dto/reset-employee-password.dto";

@ApiTags("employees")
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  list() {
    return this.employeesService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  get(@Param("id") id: string) {
    return this.employeesService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  update(@Param("id") id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Post(":id/reset-password")
  @RequirePermission("CAN_MANAGE_EMPLOYEES")
  async resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetEmployeePasswordDto,
  ) {
    await this.employeesService.resetPassword(id, dto.newPassword);
    return { ok: true };
  }
}
