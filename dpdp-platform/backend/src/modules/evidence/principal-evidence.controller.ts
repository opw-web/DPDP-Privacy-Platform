import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { renderPrincipalEvidencePdf } from "./principal-evidence-render";
import {
  PrincipalEvidenceService,
  type PrincipalEvidenceFile,
} from "./principal-evidence.service";

/**
 * `GET /api/principals/:id/evidence[.pdf]` (spec line 889, EV-03). Lives
 * in this module, not `src/modules/principals/**` (which owns
 * `PrincipalsController` and its own `/principals` routes for a
 * different task) -- same routing note as
 * `AuditEventsEvidenceController`: a controller's file location is not
 * its URL prefix, and neither route below is a single path segment, so
 * neither can collide with `PrincipalsController`'s own `GET
 * /principals/:id` catch-all.
 */
@ApiTags("evidence")
@Controller("principals")
export class PrincipalEvidenceController {
  constructor(private readonly principalEvidenceService: PrincipalEvidenceService) {}

  @Get(":id/evidence")
  @RequirePermission("CAN_VIEW_ALL_PERSONAL_DATA")
  evidence(@Param("id") id: string): Promise<PrincipalEvidenceFile> {
    return this.principalEvidenceService.buildEvidenceFile(id);
  }

  @Get(":id/evidence.pdf")
  @RequirePermission("CAN_VIEW_ALL_PERSONAL_DATA")
  async evidencePdf(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const data = await this.principalEvidenceService.buildEvidenceFile(id);
    const pdf = await renderPrincipalEvidencePdf(data);
    // A raw Buffer returned through `@Res({ passthrough: true })` hits
    // Nest's Express adapter's `isObject(body) ? response.json(body) :
    // response.send(...)` branch -- a Buffer IS an object, so it would be
    // JSON-serialized (`{"type":"Buffer","data":[...]}`) instead of sent
    // as binary. `StreamableFile` is the one return type Nest's adapter
    // special-cases (checked before that isObject branch) to pipe raw
    // bytes with the correct headers.
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evidence-${data.principal.reference}.pdf"`,
    );
    return new StreamableFile(pdf);
  }
}
