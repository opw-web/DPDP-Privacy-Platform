import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentPrincipal } from "../../common/decorators/current-principal.decorator";
import {
  JwtPrincipalGuard,
  type PrincipalActor,
} from "../../common/guards/jwt-principal.guard";
import { MeService } from "./me.service";

/**
 * `/api/me/*` -- the Data Principal's own portal API (spec line 840):
 * "resolves the principal from the token only. No route under `/api/me`
 * accepts an ID parameter." Every handler below takes ONLY
 * `@CurrentPrincipal()` -- there is no `@Param()`, `@Query()`, or `@Body()`
 * anywhere in this file, by construction, not by convention. That absence
 * is asserted mechanically by the route-table test in
 * `test/principal-portal.e2e-spec.ts` (reflecting `ROUTE_ARGS_METADATA`
 * off this class), which fails the build the moment anyone adds one.
 *
 * Every route is `@Public()` (to dodge the globally-registered
 * `JwtEmployeeGuard`) and independently `@UseGuards(JwtPrincipalGuard)`
 * (which verifies `aud: "principal"` and rejects anything else with 401)
 * -- the exact pattern `PrincipalAuthController.me()` already uses; see
 * `jwt-principal.guard.ts`'s docstring for why both directions of the
 * audience check hold with this pairing.
 */
@ApiTags("me")
@Controller("me")
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("profile")
  profile(@CurrentPrincipal() principal: PrincipalActor) {
    return this.meService.getProfile(principal.dataPrincipalId);
  }

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("data")
  data(@CurrentPrincipal() principal: PrincipalActor) {
    return this.meService.getData(principal.dataPrincipalId);
  }

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("sources")
  sources(@CurrentPrincipal() principal: PrincipalActor) {
    return this.meService.getSources(principal.dataPrincipalId);
  }

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("recipients")
  recipients(@CurrentPrincipal() principal: PrincipalActor) {
    return this.meService.getRecipients(principal.dataPrincipalId);
  }
}
