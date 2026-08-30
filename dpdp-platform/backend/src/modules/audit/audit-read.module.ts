import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { AuditReadController } from "./audit-read.controller";
import { AuditReadService } from "./audit-read.service";

@Module({
  imports: [AuditModule],
  controllers: [AuditReadController],
  providers: [AuditReadService],
  exports: [AuditReadService],
})
export class AuditReadModule {}
