import {
  Controller,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentPrincipal } from "../../common/decorators/current-principal.decorator";
import {
  JwtPrincipalGuard,
  type PrincipalActor,
} from "../../common/guards/jwt-principal.guard";
import { PrincipalAuthService } from "./principal-auth.service";
import { PrincipalLoginDto } from "./dto/principal-login.dto";
import type { AppConfig } from "../../config/configuration";

const REFRESH_COOKIE_NAME = "principal_refresh_token";

/**
 * Every route here is marked `@Public()` -- that only exempts them from
 * the GLOBAL `JwtEmployeeGuard` (see `AppModule`'s `APP_GUARD`), which
 * would otherwise reject every request lacking an `aud: "employee"`
 * token. `login`/`refresh`/`logout` genuinely need no token at all (same
 * as their employee equivalents). `me` is NOT actually open: it applies
 * `JwtPrincipalGuard` itself via `@UseGuards`, which is what enforces
 * `aud: "principal"` and rejects an employee token with 401 -- see that
 * guard's docstring for the full both-directions argument.
 */
@ApiTags("auth")
@Controller("auth/principal")
export class PrincipalAuthController {
  constructor(
    private readonly principalAuthService: PrincipalAuthService,
    private readonly configService: ConfigService,
  ) {}

  private get isProduction(): boolean {
    return this.configService.get<AppConfig>("app")?.nodeEnv === "production";
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isProduction,
      path: "/api/auth/principal",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isProduction,
      path: "/api/auth/principal",
    });
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: PrincipalLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.principalAuthService.login(
      dto.email,
      dto.password,
      { ipAddress: req.ip, userAgent: req.headers["user-agent"] },
    );
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      account: result.account,
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    if (!cookieToken) {
      throw new UnauthorizedException("Missing refresh token");
    }
    try {
      const result = await this.principalAuthService.refresh(cookieToken, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      this.setRefreshCookie(res, result.refreshToken);
      return { accessToken: result.accessToken };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE_NAME
    ];
    await this.principalAuthService.logout(cookieToken);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  @Public()
  @UseGuards(JwtPrincipalGuard)
  @Get("me")
  async me(@CurrentPrincipal() principal: PrincipalActor) {
    return this.principalAuthService.me(principal);
  }
}
