import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { LinkingService } from "./linking.service";
import { MatchingService } from "./matching.service";
import { AssemblyService } from "./assembly.service";
import { AgeService } from "./age.service";

@Module({
  imports: [AuditModule, ReferenceModule],
  providers: [MatchingService, LinkingService, AssemblyService, AgeService],
  exports: [MatchingService, LinkingService, AssemblyService, AgeService],
})
export class IdentityModule {}
