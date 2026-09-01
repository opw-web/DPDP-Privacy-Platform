import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor as Actor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { BreachService } from "./breach.service";
import { renderBoardDetailedPdf, renderBoardInitialPdf } from "./breach-render";
import { CreateBreachDto } from "./dto/create-breach.dto";
import { UpdateBreachDto } from "./dto/update-breach.dto";
import { AffectedPrincipalsDto } from "./dto/affected-principals.dto";
import { CompleteObligationDto } from "./dto/complete-obligation.dto";
import { ExtensionDto } from "./dto/extension.dto";

@ApiTags("breaches")
@Controller("breaches")
export class BreachesController {
  constructor(private readonly service: BreachService) {}

  @Get() @RequirePermission("CAN_MANAGE_BREACHES") list() {
    return this.service.list();
  }
  @Get(":id/board-initial.pdf")
  @RequirePermission("CAN_MANAGE_BREACHES")
  async boardInitial(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const report = await this.service.boardReport(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.breach.reference}-board-initial.pdf"`,
    );
    return new StreamableFile(await renderBoardInitialPdf(report));
  }
  @Get(":id/board-detailed.pdf")
  @RequirePermission("CAN_MANAGE_BREACHES")
  async boardDetailed(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const report = await this.service.boardReport(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.breach.reference}-board-detailed.pdf"`,
    );
    return new StreamableFile(await renderBoardDetailedPdf(report));
  }
  @Get(":id") @RequirePermission("CAN_MANAGE_BREACHES") get(
    @Param("id") id: string,
  ) {
    return this.service.get(id);
  }
  @Post() @RequirePermission("CAN_MANAGE_BREACHES") create(
    @Body() dto: CreateBreachDto,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.create(dto, actor);
  }
  @Patch(":id") @RequirePermission("CAN_MANAGE_BREACHES") update(
    @Param("id") id: string,
    @Body() dto: UpdateBreachDto,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.update(id, dto, actor);
  }
  @Post(":id/affected/preview")
  @RequirePermission("CAN_MANAGE_BREACHES")
  previewAffected(@Body() dto: AffectedPrincipalsDto) {
    return this.service.previewAffected(dto);
  }
  @Post(":id/affected") @RequirePermission("CAN_MANAGE_BREACHES") addAffected(
    @Param("id") id: string,
    @Body() dto: AffectedPrincipalsDto,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.addAffected(id, dto, actor);
  }
  @Post(":id/notify") @RequirePermission("CAN_SEND_BREACH_NOTICES") notify(
    @Param("id") id: string,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.notifyPrincipals(id, actor);
  }
  @Post(":id/obligations/:code/complete")
  @RequirePermission("CAN_MANAGE_BREACHES")
  completeObligation(
    @Param("id") id: string,
    @Param("code") code: string,
    @Body() dto: CompleteObligationDto,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.completeObligation(id, code, dto, actor);
  }
  @Post(":id/extension") @RequirePermission("CAN_MANAGE_BREACHES") extension(
    @Param("id") id: string,
    @Body() dto: ExtensionDto,
    @Actor() actor: AccessTokenPayload,
  ) {
    return this.service.recordExtension(id, dto, actor);
  }
}
