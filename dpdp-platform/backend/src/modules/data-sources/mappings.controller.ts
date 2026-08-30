import { Body, Controller, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MappingsService } from "./mappings.service";
import { SourcePurposesService } from "./source-purposes.service";
import { ReplaceMappingsDto } from "./dto/replace-mappings.dto";
import { AttachPurposesDto } from "./dto/attach-purposes.dto";

/**
 * Task 13's two routes, deliberately on ONE controller (task brief lists
 * a single `mappings.controller.ts`) but with DIFFERENT permission gates
 * -- not an inconsistency, a deliberate asymmetry the brief calls out:
 * mapping raw fields onto the canonical model is a data-source-shape
 * concern (`CAN_MANAGE_DATA_SOURCES`, same gate as every other route in
 * `DataSourcesController`), while attaching a lawful-basis-carrying
 * `ProcessingPurpose` is a purpose-register concern
 * (`CAN_MANAGE_PURPOSES`, the same gate `PurposesController`'s write
 * routes use). A role holding one does not automatically hold the other.
 */
@ApiTags("data-sources")
@Controller("data-sources")
export class MappingsController {
  constructor(
    private readonly mappingsService: MappingsService,
    private readonly sourcePurposesService: SourcePurposesService,
  ) {}

  @Put(":id/mappings")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  replaceMappings(@Param("id") id: string, @Body() dto: ReplaceMappingsDto) {
    return this.mappingsService.replace(id, dto);
  }

  @Put(":id/purposes")
  @RequirePermission("CAN_MANAGE_PURPOSES")
  replacePurposes(@Param("id") id: string, @Body() dto: AttachPurposesDto) {
    return this.sourcePurposesService.replace(id, dto);
  }
}
