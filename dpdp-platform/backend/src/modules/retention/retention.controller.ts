import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ErasureState } from "@prisma/client";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { ErasureTaskService } from "./erasure-task.service";
import { LegalHoldService } from "./legal-hold.service";
import { CompleteErasureTaskDto } from "./dto/complete-erasure-task.dto";
import { CancelErasureTaskDto } from "./dto/cancel-erasure-task.dto";
import { CreateLegalHoldDto } from "./dto/create-legal-hold.dto";

const ERASURE_STATE_VALUES = Object.values(ErasureState);

/**
 * Routes per spec lines 859-862, verbatim:
 *   GET    /api/retention/tasks?state=          CAN_MANAGE_RETENTION
 *   POST   /api/retention/tasks/:id/complete    CAN_APPROVE_ERASURE  (a
 *          DIFFERENT, higher permission than the other three routes --
 *          not a typo)
 *   POST   /api/retention/tasks/:id/cancel      CAN_MANAGE_RETENTION
 *   GET|POST /api/retention/legal-holds         CAN_MANAGE_RETENTION
 */
@ApiTags("retention")
@Controller("retention")
export class RetentionController {
  constructor(
    private readonly erasureTaskService: ErasureTaskService,
    private readonly legalHoldService: LegalHoldService,
  ) {}

  @Get("tasks")
  @RequirePermission("CAN_MANAGE_RETENTION")
  listTasks(@Query("state") state?: string) {
    if (state !== undefined && !ERASURE_STATE_VALUES.includes(state as ErasureState)) {
      throw new BadRequestException(
        `Unknown state "${state}". Expected one of: ${ERASURE_STATE_VALUES.join(", ")}.`,
      );
    }
    return this.erasureTaskService.list(state as ErasureState | undefined);
  }

  @Post("tasks/:id/complete")
  @RequirePermission("CAN_APPROVE_ERASURE")
  complete(
    @Param("id") id: string,
    @Body() dto: CompleteErasureTaskDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.erasureTaskService.complete(id, dto, actor);
  }

  @Post("tasks/:id/cancel")
  @RequirePermission("CAN_MANAGE_RETENTION")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelErasureTaskDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.erasureTaskService.cancel(id, dto, actor);
  }

  @Get("legal-holds")
  @RequirePermission("CAN_MANAGE_RETENTION")
  listLegalHolds() {
    return this.legalHoldService.list();
  }

  @Post("legal-holds")
  @RequirePermission("CAN_MANAGE_RETENTION")
  createLegalHold(
    @Body() dto: CreateLegalHoldDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.legalHoldService.create(dto, actor);
  }
}
