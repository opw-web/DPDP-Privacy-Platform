import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { CryptoModule } from "../../common/crypto/crypto.module";
import { ConnectorsModule } from "../connectors/connectors.module";
import { DataSourcesController } from "./data-sources.controller";
import { DataSourcesService } from "./data-sources.service";
import { MappingsController } from "./mappings.controller";
import { MappingsService } from "./mappings.service";
import { SourcePurposesService } from "./source-purposes.service";

@Module({
  imports: [AuditModule, CryptoModule, ConnectorsModule],
  controllers: [DataSourcesController, MappingsController],
  providers: [DataSourcesService, MappingsService, SourcePurposesService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
