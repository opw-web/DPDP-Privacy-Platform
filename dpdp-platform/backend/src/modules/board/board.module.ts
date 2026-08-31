import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { InformationRequestsController } from "./information-requests.controller";
import { InformationRequestsService } from "./information-requests.service";
import { VoluntaryUndertakingsController } from "./voluntary-undertakings.controller";
import { VoluntaryUndertakingsService } from "./voluntary-undertakings.service";

/**
 * Board and Government interaction (BD-01...BD-06): `InformationRequest`
 * (Rule 23 + Seventh Schedule, including the Rule 23(2) non-disclosure
 * direction -- spec line 830: "a small feature with a large failure
 * mode") and `VoluntaryUndertaking` (s.32).
 *
 * `InformationRequestsService` is exported: `./non-disclosure.ts`'s
 * plain functions (not a DI provider) are the real integration surface
 * for `campaigns` and the evidence module -- see that file's doc
 * comment -- but the service itself is exported too, for any future
 * caller that needs the `InformationRequest` CRUD directly rather than
 * just the suppression-query helpers.
 *
 * Not registered in `app.module.ts` by a prior task -- this task adds it
 * itself per its own verification instructions, and leaves it in place.
 */
@Module({
  imports: [AuditModule, ReferenceModule],
  controllers: [InformationRequestsController, VoluntaryUndertakingsController],
  providers: [InformationRequestsService, VoluntaryUndertakingsService],
  exports: [InformationRequestsService, VoluntaryUndertakingsService],
})
export class BoardModule {}
