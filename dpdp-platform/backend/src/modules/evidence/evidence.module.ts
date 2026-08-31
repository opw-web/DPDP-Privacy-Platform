import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { AuditReadModule } from "../audit/audit-read.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PrincipalsModule } from "../principals/principals.module";
import { AccessReportService } from "./access-report.service";
import { AuditChainService } from "./audit-chain.service";
import { AuditEventsEvidenceController } from "./audit-events-evidence.controller";
import { AuditExportService } from "./audit-export.service";
import { EvidencePackController } from "./evidence-pack.controller";
import { EvidencePackService } from "./evidence-pack.service";
import { PrincipalEvidenceController } from "./principal-evidence.controller";
import { PrincipalEvidenceService } from "./principal-evidence.service";

/**
 * Task 12: the s.11 access report, per-principal evidence file, audit
 * chain verification, and the evidence pack.
 *
 * `AccessReportService` is exported (not just provided) because the
 * two HTTP routes that actually serve the s.11 access report --
 * `GET /api/requests/:ref/access-report.pdf` (spec line 887, `requests`
 * module) and `GET /api/me/access-report.pdf` (spec line 890,
 * `principal-portal` module) -- are outside this task's owned paths
 * (`src/modules/evidence/**`, `test/evidence.e2e-spec.ts` only) and are
 * wired up by those modules' own tasks, which import `EvidenceModule`
 * to reach it. `access-report-render.ts`'s `renderAccessReportPdf` /
 * `renderAccessReportCsv` are plain exported functions those callers
 * import directly (no DI needed for pure functions).
 *
 * Imports `InventoryModule` and `AuditReadModule` solely to reuse
 * `RopaExportService.exportCsv()` (EV-02) and
 * `AuditReadService.accessLogCsv()` (EV-08) inside the evidence pack --
 * neither of those modules' own files is touched.
 */
@Module({
  imports: [AuditModule, PrincipalsModule, InventoryModule, AuditReadModule],
  controllers: [
    AuditEventsEvidenceController,
    PrincipalEvidenceController,
    EvidencePackController,
  ],
  providers: [
    AccessReportService,
    AuditChainService,
    AuditExportService,
    PrincipalEvidenceService,
    EvidencePackService,
  ],
  exports: [AccessReportService, PrincipalEvidenceService, AuditChainService],
})
export class EvidenceModule {}
