import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentActorPermissions } from "../../common/decorators/current-actor-permissions.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { ListPrincipalsDto } from "./dto/list-principals.dto";
import { LineageService } from "./lineage.service";
import { PrincipalRecipientsService } from "./principal-recipients.service";
import { PrincipalsService } from "./principals.service";

@ApiTags("principals")
@Controller("principals")
export class PrincipalsController {
  constructor(
    private readonly principalsService: PrincipalsService,
    private readonly lineageService: LineageService,
    private readonly recipientsService: PrincipalRecipientsService,
  ) {}

  @Get()
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  list(
    @Query() query: ListPrincipalsDto,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.principalsService.list(query, permissions);
  }

  @Get(":id/lineage")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  lineage(@Param("id") id: string) {
    return this.lineageService.getLineage(id);
  }

  @Get(":id/source-records")
  @RequirePermission("CAN_VIEW_ALL_PERSONAL_DATA")
  sourceRecords(@Param("id") id: string) {
    return this.principalsService.getSourceRecords(id);
  }

  @Get(":id/recipients")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  recipients(@Param("id") id: string) {
    return this.recipientsService.listForPrincipal(id);
  }

  @Get(":id")
  @RequirePermission("CAN_VIEW_PRINCIPALS")
  detail(
    @Param("id") id: string,
    @CurrentActorPermissions() permissions: ReadonlySet<string>,
  ) {
    return this.principalsService.getDetail(id, permissions);
  }
}
