import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { CandidatesService } from "./candidates.service";
import { ListMatchCandidatesQueryDto } from "./dto/list-match-candidates.dto";

/**
 * `/api/match-candidates` (spec lines 828-829): the review queue Task 26's
 * frontend consumes. Every route is `CAN_RESOLVE_IDENTITIES` -- viewing
 * and deciding a candidate is one capability in MVP 1, not split into a
 * separate read permission.
 */
@ApiTags("identity")
@Controller("match-candidates")
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @RequirePermission("CAN_RESOLVE_IDENTITIES")
  list(@Query() query: ListMatchCandidatesQueryDto) {
    return this.candidatesService.list(query.status);
  }

  @Post(":id/confirm")
  @RequirePermission("CAN_RESOLVE_IDENTITIES")
  confirm(@Param("id") id: string, @CurrentActor() actor: AccessTokenPayload) {
    return this.candidatesService.confirm(id, actor);
  }

  @Post(":id/reject")
  @RequirePermission("CAN_RESOLVE_IDENTITIES")
  reject(@Param("id") id: string, @CurrentActor() actor: AccessTokenPayload) {
    return this.candidatesService.reject(id, actor);
  }
}
