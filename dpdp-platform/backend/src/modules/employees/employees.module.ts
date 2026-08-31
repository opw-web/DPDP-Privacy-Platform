import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { PermissionsController } from "./permissions.controller";

@Module({
  imports: [AuditModule],
  controllers: [EmployeesController, RolesController, PermissionsController],
  providers: [EmployeesService, RolesService],
})
export class EmployeesModule {}
