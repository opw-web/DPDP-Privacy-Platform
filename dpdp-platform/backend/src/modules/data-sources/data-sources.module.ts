import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { CryptoModule } from "../../common/crypto/crypto.module";
import { ConnectorsModule } from "../connectors/connectors.module";
import { DataSourcesController } from "./data-sources.controller";
import { DataSourcesService } from "./data-sources.service";

@Module({
  imports: [AuditModule, CryptoModule, ConnectorsModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
