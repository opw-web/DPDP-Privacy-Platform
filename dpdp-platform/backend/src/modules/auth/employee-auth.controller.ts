import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import { AccessTokenPayload } from "./token.service";
import { EmployeeAuthService } from "./employee-auth.service";
import { EmployeeLoginDto } from "./dto/employee-login.dto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, TenantStore } from "../../common/tenant/tenant-context";
import type { AppConfig } from "../../config/configuration";

const REFRESH_COOKIE_NAME = "employee_refresh_token";

@ApiTags("auth")
@Controller("auth/employee")
export class EmployeeAuthController {
  constructor(
    private readonly employeeAuthService: EmployeeAuthService,
    private readonly prisma: PrismaService,
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
      path: "/api/auth/employee",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isProduction,
      path: "/api/auth/employee",
    });
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: EmployeeLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.employeeAuthService.login(
      dto.email,
      dto.password,
      { ipAddress: req.ip, userAgent: req.headers["user-agent"] },
    );
    this.setRefreshCookie(res, result.refreshToken);
    return {
      accessToken: result.accessToken,
      employee: {
        id: result.employee.id,
        email: result.employee.email,
        fullName: result.employee.fullName,
      },
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
      const result = await this.employeeAuthService.refresh(cookieToken, {
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
    await this.employeeAuthService.logout(cookieToken);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentActor() actor: AccessTokenPayload) {
    const store: TenantStore = {
      organizationId: actor.organizationId,
      actorType: "EMPLOYEE",
      actorId: actor.sub,
      actorLabel: actor.actorLabel,
    };
    return TenantContext.run(store, async () => {
      const employee = await this.prisma.scoped.employee.findFirstOrThrow({
        where: { id: actor.sub },
        include: { role: true },
      });
      return {
        id: employee.id,
        email: employee.email,
        fullName: employee.fullName,
        organizationId: employee.organizationId,
        status: employee.status,
        role: {
          id: employee.role.id,
          code: employee.role.code,
          name: employee.role.name,
        },
      };
    });
  }
}
