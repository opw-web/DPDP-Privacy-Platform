import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { DataSourcesService } from "./data-sources.service";
import { CreateDataSourceDto } from "./dto/create-data-source.dto";
import { UpdateDataSourceDto } from "./dto/update-data-source.dto";

/**
 * Every route here is `CAN_MANAGE_DATA_SOURCES` (spec lines 805-808) --
 * there is no read-only tier for data sources in MVP1's endpoint table,
 * unlike purposes (`GET` is `CAN_VIEW_PRINCIPALS`, writes are
 * `CAN_MANAGE_PURPOSES`).
 */
@ApiTags("data-sources")
@Controller("data-sources")
export class DataSourcesController {
  constructor(private readonly dataSourcesService: DataSourcesService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  list() {
    return this.dataSourcesService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  get(@Param("id") id: string) {
    return this.dataSourcesService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  create(@Body() dto: CreateDataSourceDto) {
    return this.dataSourcesService.create(dto);
  }

  @Patch(":id")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  update(@Param("id") id: string, @Body() dto: UpdateDataSourceDto) {
    return this.dataSourcesService.update(id, dto);
  }

  @Delete(":id")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.dataSourcesService.remove(id);
  }

  @Post(":id/test-connection")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  testConnection(@Param("id") id: string) {
    return this.dataSourcesService.testConnection(id);
  }

  @Post(":id/discover-schema")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  discoverSchema(@Param("id") id: string) {
    return this.dataSourcesService.discoverSchema(id);
  }

  @Get(":id/fields")
  @RequirePermission("CAN_MANAGE_DATA_SOURCES")
  listFields(@Param("id") id: string) {
    return this.dataSourcesService.listFields(id);
  }
}
