import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { NoticesController } from "./notices.controller";
import { NoticesService } from "./notices.service";

/**
 * Exports `NoticesService` -- Wave 3's `CONSENT_REQUEST` campaign task
 * needs `NoticesService.getPublishedVersion()` to enforce NT-01 ("notice
 * precedes consent": a campaign cannot be created without a published
 * `noticeVersionId`). The wave integrator registers this module in
 * `AppModule` (not owned by this task) and wires that dependency.
 */
@Module({
  imports: [AuditModule],
  controllers: [NoticesController],
  providers: [NoticesService],
  exports: [NoticesService],
})
export class NoticesModule {}
