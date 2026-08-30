import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { RecipientsController } from "./recipients.controller";
import { RecipientsService } from "./recipients.service";
import { SharingController } from "./sharing.controller";
import { SharingService } from "./sharing.service";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";
import { SecurityMeasuresController } from "./security-measures.controller";
import { SecurityMeasuresService } from "./security-measures.service";

/**
 * The five compliance registers (task brief): recipients, sharing
 * activities, cross-border transfers, retention policies, security
 * measures. Five explicit, boring, similar services rather than one
 * generic "register" abstraction -- each has its own compliance
 * annotations and its own gate (s.8(2) for recipients, s.11(1)(b) for
 * sharing, none for transfers by design, Global Constraint 4 for
 * retention), so a shared base class would hide more than it would
 * save.
 */
@Module({
  imports: [AuditModule],
  controllers: [
    RecipientsController,
    SharingController,
    TransfersController,
    RetentionController,
    SecurityMeasuresController,
  ],
  providers: [
    RecipientsService,
    SharingService,
    TransfersService,
    RetentionService,
    SecurityMeasuresService,
  ],
})
export class RegistersModule {}
