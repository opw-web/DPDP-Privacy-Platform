import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentActor } from "../../common/decorators/current-actor.decorator";
import type { AccessTokenPayload } from "../auth/token.service";
import { NoticesService } from "./notices.service";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { CreateNoticeVersionDto } from "./dto/create-notice-version.dto";
import { UpsertTranslationDto } from "./dto/upsert-translation.dto";

/**
 * Every route here is `CAN_MANAGE_NOTICES` per the spec's endpoint table
 * (lines 838-841): `GET|POST /api/notices[/:id]`,
 * `POST /api/notices/:id/versions`,
 * `POST /api/notices/:id/versions/:v/publish`,
 * `PUT /api/notices/:id/versions/:v/translations/:lang`. `eligible-fields`
 * and `preview` are additions this task made to make the builder actually
 * usable (§4.2 requires a standalone preview and "the admin ticks which
 * itemised fields appear"); both reuse the SAME permission -- no new
 * permission code was added anywhere.
 */
@ApiTags("notices")
@Controller("notices")
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  @RequirePermission("CAN_MANAGE_NOTICES")
  list() {
    return this.noticesService.list();
  }

  @Get(":id")
  @RequirePermission("CAN_MANAGE_NOTICES")
  get(@Param("id") id: string) {
    return this.noticesService.get(id);
  }

  @Post()
  @RequirePermission("CAN_MANAGE_NOTICES")
  create(@Body() dto: CreateNoticeDto) {
    return this.noticesService.create(dto);
  }

  @Get(":id/eligible-fields")
  @RequirePermission("CAN_MANAGE_NOTICES")
  listEligibleFields(@Param("id") id: string) {
    return this.noticesService.listEligibleFields(id);
  }

  @Post(":id/versions")
  @RequirePermission("CAN_MANAGE_NOTICES")
  createVersion(
    @Param("id") id: string,
    @Body() dto: CreateNoticeVersionDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.noticesService.createVersion(id, dto, actor);
  }

  @Post(":id/versions/:v/publish")
  @RequirePermission("CAN_MANAGE_NOTICES")
  publish(
    @Param("id") id: string,
    @Param("v", ParseIntPipe) version: number,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.noticesService.publish(id, version, actor);
  }

  @Get(":id/versions/:v/preview")
  @RequirePermission("CAN_MANAGE_NOTICES")
  preview(
    @Param("id") id: string,
    @Param("v", ParseIntPipe) version: number,
    @Query("lang") lang?: string,
  ) {
    return this.noticesService.preview(id, version, lang);
  }

  @Put(":id/versions/:v/translations/:lang")
  @RequirePermission("CAN_MANAGE_NOTICES")
  upsertTranslation(
    @Param("id") id: string,
    @Param("v", ParseIntPipe) version: number,
    @Param("lang") lang: string,
    @Body() dto: UpsertTranslationDto,
    @CurrentActor() actor: AccessTokenPayload,
  ) {
    return this.noticesService.upsertTranslation(id, version, lang, dto, actor);
  }
}
