import { Module } from "@nestjs/common";
import { AuditModule } from "../../../common/audit/audit.module";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

/**
 * There is no `messaging.module.ts` -- each messaging sub-module
 * registers directly in `app.module.ts` (the integrator's job, not this
 * task's; task 3 owns `src/modules/messaging/templates/**` only).
 */
@Module({
  imports: [AuditModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
