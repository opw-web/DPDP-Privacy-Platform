import { Controller, Get, Res, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { EvidencePackService } from "./evidence-pack.service";

/** `GET /api/evidence/pack.zip` (spec line 890, checklist section 16 -- EV-01…EV-12 minus EV-03). */
@ApiTags("evidence")
@Controller("evidence")
export class EvidencePackController {
  constructor(private readonly evidencePackService: EvidencePackService) {}

  @Get("pack.zip")
  @RequirePermission("CAN_EXPORT_EVIDENCE")
  async packZip(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const zip = await this.evidencePackService.buildPack();
    // See `PrincipalEvidenceController.evidencePdf`'s comment: a raw
    // Buffer returned through `@Res({ passthrough: true })` gets
    // JSON-serialized by Nest's Express adapter instead of sent as
    // binary. `StreamableFile` avoids that.
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="evidence-pack.zip"');
    return new StreamableFile(zip);
  }
}
