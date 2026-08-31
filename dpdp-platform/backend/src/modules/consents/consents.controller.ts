import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { ConsentsService } from "./consents.service";
import { ImportConsentDto } from "./dto/import-consent.dto";

/**
 * Employee-facing consent routes, per the spec's endpoint table (lines
 * 843-845), all `CAN_MANAGE_CONSENTS`:
 *
 *   GET    /api/principals/:id/consents
 *   POST   /api/principals/:id/consents/:purposeId    (imported consent)
 *   GET    /api/purposes/:id/consent-stats
 *
 * A single `@Controller()` with no class-level prefix so each method can
 * declare its own full path -- these three routes span two different
 * resource families ("principals" and "purposes"), neither of which this
 * task owns a controller for, so no existing controller is a natural
 * home. Matches the pattern spec lines 843-845 lay the routes out in
 * (grouped by capability, not by resource prefix).
 */
@ApiTags("consents")
@Controller()
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Get("principals/:id/consents")
  @RequirePermission("CAN_MANAGE_CONSENTS")
  listForPrincipal(@Param("id") id: string) {
    return this.consentsService.listForPrincipal(id);
  }

  @Post("principals/:id/consents/:purposeId")
  @RequirePermission("CAN_MANAGE_CONSENTS")
  recordImportedConsent(
    @Param("id") id: string,
    @Param("purposeId") purposeId: string,
    @Body() dto: ImportConsentDto,
    @Req() req: Request,
  ) {
    return this.consentsService.recordImportedConsent(
      id,
      purposeId,
      dto,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Get("purposes/:id/consent-stats")
  @RequirePermission("CAN_MANAGE_CONSENTS")
  getConsentStats(@Param("id") id: string) {
    return this.consentsService.getConsentStats(id);
  }
}
