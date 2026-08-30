import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { InventoryService } from "./inventory.service";
import { RopaExportService } from "./ropa-export.service";

/**
 * `/api/inventory/*` (spec lines 831-835, dashboard contents at line 849):
 * the evidence-floor dashboard, its gap list, and the RoPA export.
 * `summary`/`gaps` are `CAN_VIEW_PRINCIPALS`-gated reads; `ropa.csv` is
 * `CAN_EXPORT_EVIDENCE`-gated (EV-02) and writes `EVIDENCE_EXPORTED`.
 */
@ApiTags("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly ropaExportService: RopaExportService,
  ) {}

  @Get("summary")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  summary() {
    return this.inventoryService.getSummary();
  }

  @Get("gaps")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  gaps() {
    return this.inventoryService.getGaps();
  }

  @Get("ropa.csv")
  @RequirePermission("CAN_EXPORT_EVIDENCE")
  async ropaCsv(@Res({ passthrough: true }) res: Response): Promise<string> {
    const csv = await this.ropaExportService.exportCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ropa.csv"');
    return csv;
  }
}
