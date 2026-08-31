import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { MaskingModule } from "../../common/masking/masking.module";
import { GuardiansController } from "./guardians.controller";
import { GuardiansService } from "./guardians.service";
import { AgeStatusController } from "./age-status.controller";
import { AgeStatusService } from "./age-status.service";
import { ChildExemptionsController } from "./child-exemptions.controller";
import { ChildExemptionsService } from "./child-exemptions.service";

/**
 * `GuardiansService` is exported so Wave 3's consent task can import
 * `ChildrenModule` and inject it to call
 * `GuardiansService.assertGuardianConsentEligible(...)` (see that
 * method's doc comment, and this task's report's "Interfaces published"
 * section) -- the enforceable-from-outside-this-module predicate CH-01…
 * CH-03 requires.
 */
@Module({
  imports: [AuditModule, MaskingModule],
  controllers: [
    GuardiansController,
    AgeStatusController,
    ChildExemptionsController,
  ],
  providers: [GuardiansService, AgeStatusService, ChildExemptionsService],
  exports: [GuardiansService],
})
export class ChildrenModule {}
