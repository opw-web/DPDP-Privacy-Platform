import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentPrincipal } from "../../common/decorators/current-principal.decorator";
import { JwtPrincipalGuard, type PrincipalActor } from "../../common/guards/jwt-principal.guard";
import { ConsentsService } from "./consents.service";
import { SetMyConsentDto } from "./dto/set-my-consent.dto";

/**
 * `/api/me/consents*` -- the Data Principal's own portal actions (spec
 * line 894): `GET /api/me/consents`, `POST /api/me/consents/:purposeId`.
 * CN-05: grant and withdraw are the SAME action (`status` in the body),
 * reachable through the SAME route, at the SAME depth -- there is no
 * separate withdraw endpoint.
 *
 * Kept OUT of `MeController` (`principal-portal` module, not owned by
 * this task) and given its own controller here. `dataPrincipalId` is
 * resolved EXCLUSIVELY from `@CurrentPrincipal()` -- never a route
 * parameter -- exactly like every handler in `MeController`. The one
 * parameter this class's write route declares, `:purposeId`, names a
 * resource (which purpose the decision is about), never a person: it can
 * never be used to select whose consent is read or written, since
 * `dataPrincipalId` never comes from anywhere but the verified token.
 * Same `@Public()` + `@UseGuards(JwtPrincipalGuard)` pairing
 * `MeController`/`PrincipalAuthController.me()` already use.
 */
@ApiTags("me")
@Controller("me/consents")
export class MeConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get()
  list(@CurrentPrincipal() principal: PrincipalActor) {
    return this.consentsService.listForPrincipal(principal.dataPrincipalId);
  }

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Post(":purposeId")
  setStatus(
    @CurrentPrincipal() principal: PrincipalActor,
    @Param("purposeId") purposeId: string,
    @Body() dto: SetMyConsentDto,
    @Req() req: Request,
  ) {
    return this.consentsService.setMyConsentStatus(
      principal.dataPrincipalId,
      purposeId,
      dto,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  }
}
