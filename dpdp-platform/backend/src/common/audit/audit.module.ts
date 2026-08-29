import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AccessLogService } from "./access-log.service";

@Module({
  providers: [AuditService, AccessLogService],
  exports: [AuditService, AccessLogService],
})
export class AuditModule {}
