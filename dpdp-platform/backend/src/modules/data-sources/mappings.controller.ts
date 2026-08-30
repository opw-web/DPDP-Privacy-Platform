import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { MappingsService } from "./mappings.service";
import { SourcePurposesService } from "./source-purposes.service";
import { ReplaceMappingsDto } from "./dto/replace-mappings.dto";
import { AttachPurposesDto } from "./dto/attach-purposes.dto";
import { MappingsResponseDto } from "./dto/mappings-response.dto";
import { DataSourcePurposesResponseDto } from "./dto/purposes-response.dto";

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
 *
 * The two `GET` routes below do NOT mirror that asymmetry: both are
 * `CAN_MANAGE_DATA_SOURCES`, the SAME permission `DataSourcesController`'s
 * `GET :id` already requires -- there is no separate read-only tier for a
 * data source or anything hanging off one (see that controller's own
 * doc comment). Reading which purposes a source relies on is still a
 * fact about the SOURCE, not a purpose-register write, so it stays on
 * the data-source read gate rather than borrowing `PurposesController`'s
 * own (different) read permission, `CAN_VIEW_PRINCIPALS`.
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

  /**
   * CN-02 is a STANDING property of the current mapping set, not a
   * write-time event (`mapping-warnings.ts`) -- so this returns the exact
   * same `{ mappings, warnings }` shape `PUT` does, and both are computed
   * by the one shared `computeMappingWarnings()`. A mapping that would
   * warn on write still warns here on a plain read, with no write
   * involved.
   */
  @Get(":id/mappings")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  @ApiOkResponse({ type: MappingsResponseDto })
  getMappings(@Param("id") id: string) {
    return this.mappingsService.get(id);
  }

  @Put(":id/purposes")
  @RequirePermission("CAN_MANAGE_PURPOSES")
  replacePurposes(@Param("id") id: string, @Body() dto: AttachPurposesDto) {
    return this.sourcePurposesService.replace(id, dto);
  }

  /**
   * The purposes currently attached to this data source (Check 11 / LB-02:
   * never inferred from a data category -- a purpose is either attached
   * and stated here, or absent and `purposes` is `[]`). Includes each
   * purpose's `isReviewed`, so the frontend can render the amber "Not yet
   * reviewed" chip without a second lookup against `/api/purposes`.
   */
  @Get(":id/purposes")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  @ApiOkResponse({ type: DataSourcePurposesResponseDto })
  getPurposes(@Param("id") id: string) {
    return this.sourcePurposesService.get(id);
  }
}
