import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../../common/decorators/current-actor.decorator";
import { CurrentActorPermissions } from "../../../common/decorators/current-actor-permissions.decorator";
import type { AccessTokenPayload } from "../../auth/token.service";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";

/**
 * `GET|POST /api/campaigns[/:id]`, `POST /api/campaigns/:id/send`,
 * `GET /api/campaigns/:id/recipients` -- `CAN_SEND_MESSAGES` (spec line
 * 869). `POST /api/campaigns/:id/approve` -- `CAN_SEND_BREACH_NOTICES`
 * (spec line 868, transcribed verbatim: every campaign requiring
 * approval, not only a BREACH_NOTICE one, is gated behind this single
 * permission at the route layer -- `CampaignsService.approve()` enforces
 * the actual "different employee" rule underneath it).
 *
 * `send()` also needs the caller's resolved permission set --
 * `CampaignsService.send()`'s own guard 3 re-checks
 * `CAN_SEND_BREACH_NOTICES` against the actor actually triggering the
 * send, independent of the route's base `CAN_SEND_MESSAGES` permission
 * and independent of who created/approved the campaign -- same pattern
 * `AudienceController.preview()` already established for
 * `CurrentActorPermissions()`.
 */
@ApiTags("campaigns")
@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @RequirePermission("CAN_SEND_MESSAGES")
  list() {
    return this.campaignsService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_SEND_MESSAGES")
  get(@Param("id") id: string) {
    return this.campaignsService.get(id);
  }

  @Post()
  @RequirePermission("CAN_SEND_MESSAGES")
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.campaignsService.create(dto, actor);
  }

  @Post(":id/approve")
  @RequirePermission("CAN_SEND_BREACH_NOTICES")
  approve(@Param("id") id: string, @CurrentActor() actor: AccessTokenPayload) {
    return this.campaignsService.approve(id, actor);
  }

  @Post(":id/send")
  @RequirePermission("CAN_SEND_MESSAGES")
  send(
    @Param("id") id: string,
    @CurrentActor() actor: AccessTokenPayload,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.campaignsService.send(id, actor, permissions);
  }

  @Get(":id/recipients")
  @RequirePermission("CAN_SEND_MESSAGES")
  listRecipients(@Param("id") id: string) {
    return this.campaignsService.listRecipients(id);
  }
}
