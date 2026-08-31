import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { AgeStatusService } from "./age-status.service";
import { SetAgeStatusDto } from "./dto/set-age-status.dto";

/**
 * Deliberately its OWN controller (not folded into `PrincipalsController`,
 * which this module does not own) registering the single `principals`
 * sub-route the spec's endpoint table (line 849) assigns to Task 8:
 * `POST /api/principals/:id/age-status`. NestJS allows more than one
 * controller class to share the `principals` base path as long as no two
 * handlers register the identical (method, path) pair -- neither route
 * below collides with anything `PrincipalsController` (owned by another
 * task) declares.
 */
@ApiTags("children")
@Controller("principals")
export class AgeStatusController {
  constructor(private readonly ageStatusService: AgeStatusService) {}

  @Post(":id/age-status")
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  setAgeStatus(@Param("id") id: string, @Body() dto: SetAgeStatusDto) {
    return this.ageStatusService.setAgeStatus(id, dto);
  }

  /**
   * Not in the spec's fixed endpoint table (lines 847-850) -- added to
   * satisfy this task's own requirement ("Expose the count of principals
   * with ageStatus = UNKNOWN"), reported explicitly in this task's
   * report. Two path segments after `principals/`, so it cannot be
   * shadowed by `PrincipalsController`'s single-segment `@Get(":id")`
   * catch-all regardless of module registration order.
   */
  @Get("age-status/unknown-count")
  @RequirePermission("CAN_MANAGE_CHILD_DATA")
  unknownCount() {
    return this.ageStatusService
      .countUnknown()
      .then((unknownCount) => ({ unknownCount }));
  }
}
