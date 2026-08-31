import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";

/**
 * Exports `ComplianceService`: Tasks 6, 9, 13 and 14 import
 * `ComplianceModule` into their own feature modules to inject it and
 * snapshot deadlines onto their own entities. The wave integrator
 * registers this module in `AppModule` -- not done here, per this task's
 * "touch nothing outside src/modules/compliance/**" boundary.
 */
@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
