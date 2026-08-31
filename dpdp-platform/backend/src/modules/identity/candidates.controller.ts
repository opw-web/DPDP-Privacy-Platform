import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import { CurrentActorPermissions } from "../../common/decorators/current-actor-permissions.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CAN_VIEW_ALL_PERSONAL_DATA } from "../../common/masking/masking.service";
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

  /**
   * I-2 (final whole-branch review): this queue's whole purpose is
   * comparing identifying values side by side, so masking either side
   * would make the feature useless -- unlike `principals.service.ts`,
   * which masks and stays useful. The `record`/`principal` blocks below
   * therefore carry raw EMAIL/PHONE/FULL_NAME/DATE_OF_BIRTH, so the
   * route requires `CAN_VIEW_ALL_PERSONAL_DATA` in ADDITION to
   * `CAN_RESOLVE_IDENTITIES` -- an actor who can decide a candidate but
   * not see unmasked personal data must not reach this list at all.
   * `@RequirePermission` is OR-only by design (see its own doc comment),
   * so an AND requirement is this explicit second check, exactly as that
   * comment prescribes, reusing the same `CAN_VIEW_ALL_PERSONAL_DATA`
   * constant `MaskingService` gates on everywhere else rather than a
   * second ad hoc string. `confirm`/`reject` are unaffected: their
   * responses carry only ids, never a personal-data value.
   */
  @Get()
  @RequirePermission("CAN_RESOLVE_IDENTITIES")
  list(
    @Query() query: ListMatchCandidatesQueryDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    if (!permissions.has(CAN_VIEW_ALL_PERSONAL_DATA)) {
      throw new ForbiddenException(
        `Missing required permission: ${CAN_VIEW_ALL_PERSONAL_DATA}`,
      );
    }
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
