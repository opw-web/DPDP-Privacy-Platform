import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { UnmergeDto } from "./dto/unmerge.dto";
import { MergeService } from "./merge.service";

/**
 * `POST /api/principals/:id/unmerge` (spec line 827). A dedicated
 * controller under the shared `principals` route prefix rather than
 * folding into a (not yet built, out of this task's scope) principals
 * module -- same reasoning `SyncController` already documents for living
 * apart from `DataSourcesController`: Nest merges routes from multiple
 * controllers that share a `@Controller()` prefix.
 */
@ApiTags("identity")
@Controller("principals")
export class UnmergeController {
  constructor(private readonly mergeService: MergeService) {}

  @Post(":id/unmerge")
  @RequirePermission("CAN_RESOLVE_IDENTITIES")
  unmerge(
    @Param("id") id: string,
    @Body() dto: UnmergeDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.mergeService.unmerge(
      id,
      dto.normalizedRecordId,
      dto.reason,
      actor,
    );
  }
}
