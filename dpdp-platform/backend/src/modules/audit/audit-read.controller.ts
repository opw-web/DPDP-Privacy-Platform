import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentActorPermissions } from "../../common/decorators/current-actor-permissions.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { AuditReadService } from "./audit-read.service";
import { AccessLogExportDto } from "./dto/access-log-export.dto";
import { ListAuditEventsDto } from "./dto/list-audit-events.dto";

/**
 * `/api/audit-events/*` (spec lines 833-834). `GET /api/audit-events` is
 * `CAN_VIEW_AUDIT_LOG`-gated and read-only -- there is no write path
 * anywhere in this controller. `GET /api/audit-events/access-log.csv` is
 * `CAN_EXPORT_EVIDENCE`-gated (EV-08) and writes `EVIDENCE_EXPORTED`.
 */
@ApiTags("audit")
@Controller("audit-events")
export class AuditReadController {
  constructor(private readonly auditReadService: AuditReadService) {}

  @Get()
  @RequirePermission("CAN_VIEW_AUDIT_LOG")
  list(
    @Query() query: ListAuditEventsDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.auditReadService.list(query, permissions);
  }

  @Get("access-log.csv")
  @RequirePermission("CAN_EXPORT_EVIDENCE")
  async accessLogCsv(
    @Query() query: AccessLogExportDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.auditReadService.accessLogCsv(query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="access-log.csv"',
    );
    return csv;
  }
}
