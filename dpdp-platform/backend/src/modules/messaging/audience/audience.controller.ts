import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../common/decorators/require-permission.decorator";
import { CurrentActorPermissions } from "../../../common/decorators/current-actor-permissions.decorator";
import { AudienceService } from "./audience.service";
import { PreviewAudienceDto } from "./dto/preview-audience.dto";

/**
 * `POST /api/audiences/preview` -- DPDP_MVP2_COMPLIANCE_OPERATIONS.md
 * §4.7 line 750. `CAN_SEND_MESSAGES`, same permission code every
 * `messaging/templates` route already uses (already seeded and
 * role-assigned by Task 1 -- no permission is added here).
 */
@ApiTags("audiences")
@Controller("audiences")
export class AudienceController {
  constructor(private readonly audienceService: AudienceService) {}

  @Post("preview")
  @RequirePermission("CAN_SEND_MESSAGES")
  preview(
    @Body() dto: PreviewAudienceDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.audienceService.preview(dto, permissions);
  }
}
