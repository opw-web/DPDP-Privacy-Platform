import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { MaskingModule } from "../../common/masking/masking.module";
import { LineageService } from "./lineage.service";
import { PrincipalRecipientsService } from "./principal-recipients.service";
import { PrincipalsController } from "./principals.controller";
import { PrincipalsService } from "./principals.service";

@Module({
  imports: [AuditModule, MaskingModule],
  controllers: [PrincipalsController],
  providers: [LineageService, PrincipalRecipientsService, PrincipalsService],
  exports: [PrincipalsService, LineageService, PrincipalRecipientsService],
})
export class PrincipalsModule {}
