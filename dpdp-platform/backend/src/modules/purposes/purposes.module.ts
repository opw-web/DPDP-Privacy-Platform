import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { PurposesController } from "./purposes.controller";
import { PurposesService } from "./purposes.service";

@Module({
  imports: [AuditModule],
  controllers: [PurposesController],
  providers: [PurposesService],
})
export class PurposesModule {}
