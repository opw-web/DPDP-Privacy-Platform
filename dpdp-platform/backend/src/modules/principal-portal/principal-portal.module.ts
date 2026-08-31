import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrincipalsModule } from "../principals/principals.module";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";

/**
 * Task 22: the Data Principal self-service portal API (`/api/me/*`).
 *
 * Imports `AuthModule` for exactly one reason: `MeController`'s
 * `@UseGuards(JwtPrincipalGuard)` needs `JwtPrincipalGuard`'s own
 * constructor dependency `TokenService` to be resolvable in THIS module's
 * DI context (Nest instantiates a guard referenced by class, not
 * pre-registered as a local provider, using the enclosing module's
 * visible providers) -- `PrismaService` resolves fine on its own since
 * `PrismaModule` is `@Global()`, but `TokenService` is not global and is
 * only exported by `AuthModule`. `PrincipalAuthController` never needed
 * this import because it lives inside `AuthModule` itself.
 *
 * Imports `PrincipalsModule` to reuse its exported
 * `PrincipalsService`/`LineageService`/`PrincipalRecipientsService`
 * rather than re-declaring or duplicating any of their provenance,
 * masking-bypass, or RT-04 intersection logic -- see `MeService`'s
 * docstring for exactly which method of each is reused and why.
 *
 * PrincipalContactEvent / PERSONAL_DATA_VIEWED ruling (repeated here so
 * it is visible next to the module boundary, not just inside
 * `me.service.ts`): no handler reached through this module writes either.
 * `PrincipalContactEvent.channel`'s documented vocabulary (`PORTAL_LOGIN
 * | REQUEST | CONSENT_ACTION | EMAIL_IN | PHONE | CAMPAIGN_OUT`) has no
 * member meaning "she viewed her own data" -- inventing one would repeat
 * the exact mistake this codebase forbids for `AuditAction`. The contact
 * event that evidences this whole session already exists:
 * `PrincipalAuthService.login` writes an INBOUND `PORTAL_LOGIN` row before
 * any `/me/*` route is ever reached. Writing a further row per GET would
 * dilute contact history (the record that later evidences notice delivery
 * and rights-request correspondence) rather than sharpen it.
 * `PERSONAL_DATA_VIEWED` is not written either: `AccessLogService`'s own
 * docstring frames that action as "who looked at THIS PERSON's data",
 * which presupposes an actor distinct from the subject -- exactly why
 * `PrincipalsService.getUnmaskedProfile` (reused here for `/me/profile`)
 * was built without that call in the first place.
 */
@Module({
  imports: [AuthModule, PrincipalsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class PrincipalPortalModule {}
