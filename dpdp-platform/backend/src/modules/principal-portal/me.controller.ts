import {
  Controller,
  Get,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentPrincipal } from "../../common/decorators/current-principal.decorator";
import {
  JwtPrincipalGuard,
  type PrincipalActor,
} from "../../common/guards/jwt-principal.guard";
import { MePrivacyContactDto } from "./dto/me-privacy-contact.dto";
import { MeProfileTimezoneDto } from "./dto/me-profile-timezone.dto";
import { MeService } from "./me.service";
import type { Response } from "express";
import { AccessReportService } from "../evidence/access-report.service";
import { renderAccessReportPdf } from "../evidence/access-report-render";

/**
 * `/api/me/*` -- the Data Principal's own portal API (spec line 840):
 * "resolves the principal from the token only. No route under `/api/me`
 * accepts an ID parameter." Every handler below takes, at most, ONLY
 * `@CurrentPrincipal()` -- there is no `@Param()`, `@Query()`, or `@Body()`
 * anywhere in this file, by construction, not by convention. That absence
 * is asserted mechanically by the route-table test in
 * `test/principal-portal.e2e-spec.ts` (reflecting `ROUTE_ARGS_METADATA`
 * off this class), which fails the build the moment anyone adds one.
 * `privacyContact()` below takes no parameter at all, which trivially
 * satisfies the same rule -- it reads a fact about the organization, not
 * a `@Param()`/`@Query()`/`@Body()` selecting some other principal.
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
  constructor(
    private readonly meService: MeService,
    private readonly accessReportService: AccessReportService,
  ) {}

  /**
   * The rest of this shape comes from `PrincipalsService.getUnmaskedProfile`
   * (owned by the `principals` module, not re-declared here). `@ApiOkResponse`
   * below documents only the `organizationTimezone` addition -- via `allOf`
   * against a permissive `additionalProperties: true` object schema -- so
   * `/api/docs` is accurate about that field without misrepresenting the
   * response as containing nothing else.
   */
  @Public()
  @UseGuards(JwtPrincipalGuard)
  @ApiExtraModels(MeProfileTimezoneDto)
  @ApiOkResponse({
    description:
      "The calling principal's own profile (values never masked), plus " +
      "organizationTimezone -- see MeProfileTimezoneDto.",
    schema: {
      allOf: [
        { type: "object", additionalProperties: true },
        { $ref: getSchemaPath(MeProfileTimezoneDto) },
      ],
    },
  })
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

  /** RT-03/04: the calling principal's own s.11 report. The principal id
   * comes only from JwtPrincipalGuard's CurrentPrincipal decorator; there is
   * intentionally no path/query/body selector on this route. */
  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("access-report.pdf")
  async accessReport(
    @CurrentPrincipal() principal: PrincipalActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.accessReportService.buildReport(
      principal.dataPrincipalId,
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.principal.reference}-access-report.pdf"`,
    );
    return new StreamableFile(await renderAccessReportPdf(report));
  }

  /**
   * The organization's published DPO / responsible-person contact
   * (GO-10). Takes no `@CurrentPrincipal()` -- unlike every other handler
   * above, this one selects nothing about the caller; only
   * `@UseGuards(JwtPrincipalGuard)` matters here, to require a valid
   * principal-audience token before this route runs. The organization
   * itself is resolved from that token's already-bound `TenantContext`
   * inside `MeService.getPrivacyContact`, exactly like
   * `OrganizationsController.get()` -- never from a path/query/body
   * parameter, so this still satisfies the file-level rule above.
   */
  @Public()
  @UseGuards(JwtPrincipalGuard)
  @ApiOkResponse({ type: MePrivacyContactDto })
  @Get("privacy-contact")
  privacyContact(): Promise<MePrivacyContactDto> {
    return this.meService.getPrivacyContact();
  }
}
