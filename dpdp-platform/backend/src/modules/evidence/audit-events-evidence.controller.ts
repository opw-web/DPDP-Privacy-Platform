import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { AuditChainService, type ChainVerificationResult } from "./audit-chain.service";
import { AuditExportService } from "./audit-export.service";

/**
 * `/api/audit-events/verify-chain` and `/api/audit-events/export.csv`
 * (spec lines 887-888, task 12 brief). Lives in this module (not
 * `src/modules/audit/**`, which already owns `GET /api/audit-events` and
 * `GET /api/audit-events/access-log.csv` for a different task) because
 * this task's owned paths are `src/modules/evidence/**` only -- Nest
 * routes are not tied to which module's directory declares the
 * controller, and neither of the two routes below collides with either
 * of that controller's routes.
 */
@ApiTags("audit")
@Controller("audit-events")
export class AuditEventsEvidenceController {
  constructor(
    private readonly auditChainService: AuditChainService,
    private readonly auditExportService: AuditExportService,
  ) {}

  @Get("verify-chain")
  @RequirePermission("CAN_VIEW_AUDIT_LOG")
  verifyChain(): Promise<ChainVerificationResult> {
    return this.auditChainService.verifyChain();
  }

  @Get("export.csv")
  @RequirePermission("CAN_EXPORT_EVIDENCE")
  async exportCsv(@Res({ passthrough: true }) res: Response): Promise<string> {
    const csv = await this.auditExportService.exportCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="audit-events-export.csv"',
    );
    return csv;
  }
}
