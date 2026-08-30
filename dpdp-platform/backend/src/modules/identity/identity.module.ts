import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { LinkingService } from "./linking.service";
import { MatchingService } from "./matching.service";
import { AssemblyService } from "./assembly.service";
import { AgeService } from "./age.service";
import { MergeService } from "./merge.service";
import { CandidatesService } from "./candidates.service";
import { CandidatesController } from "./candidates.controller";
import { UnmergeController } from "./unmerge.controller";

@Module({
  imports: [AuditModule, ReferenceModule],
  controllers: [CandidatesController, UnmergeController],
  providers: [
    MatchingService,
    LinkingService,
    AssemblyService,
    AgeService,
    MergeService,
    CandidatesService,
  ],
  exports: [
    MatchingService,
    LinkingService,
    AssemblyService,
    AgeService,
    MergeService,
    CandidatesService,
  ],
})
export class IdentityModule {}
