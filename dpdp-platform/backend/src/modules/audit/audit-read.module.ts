import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { MaskingModule } from "../../common/masking/masking.module";
import { AuditReadController } from "./audit-read.controller";
import { AuditReadService } from "./audit-read.service";

@Module({
  imports: [AuditModule, MaskingModule],
  controllers: [AuditReadController],
  providers: [AuditReadService],
  exports: [AuditReadService],
})
export class AuditReadModule {}
