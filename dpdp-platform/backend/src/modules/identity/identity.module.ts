import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { LinkingService } from "./linking.service";
import { MatchingService } from "./matching.service";

@Module({
  imports: [AuditModule, ReferenceModule],
  providers: [MatchingService, LinkingService],
  exports: [MatchingService, LinkingService],
})
export class IdentityModule {}
