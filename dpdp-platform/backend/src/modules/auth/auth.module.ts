import { Module } from "@nestjs/common";
import { AuditModule } from "../../common/audit/audit.module";
import { TokenService } from "./token.service";
import { EmployeeAuthService } from "./employee-auth.service";
import { EmployeeAuthController } from "./employee-auth.controller";
import { PrincipalAuthService } from "./principal-auth.service";
import { PrincipalAuthController } from "./principal-auth.controller";
import { JwtPrincipalGuard } from "../../common/guards/jwt-principal.guard";

/**
 * `TokenService` is exported so `TenantModule` can inject it into
 * `TenantMiddleware` (populating `TenantContext` from a verified access
 * token) without duplicating JWT verification logic.
 */
@Module({
  imports: [AuditModule],
  controllers: [EmployeeAuthController, PrincipalAuthController],
  providers: [
    TokenService,
    EmployeeAuthService,
    PrincipalAuthService,
    JwtPrincipalGuard,
  ],
  exports: [TokenService],
})
export class AuthModule {}
