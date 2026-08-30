import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { RopaExportService } from "./ropa-export.service";

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService, RopaExportService],
  exports: [InventoryService, RopaExportService],
})
export class InventoryModule {}
