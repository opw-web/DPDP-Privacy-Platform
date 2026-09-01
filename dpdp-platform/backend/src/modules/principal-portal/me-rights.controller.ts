import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentPrincipal } from "../../common/decorators/current-principal.decorator";
import {
  JwtPrincipalGuard,
  type PrincipalActor,
} from "../../common/guards/jwt-principal.guard";
import { AddMeRequestCommentDto } from "./dto/add-me-request-comment.dto";
import { CreateMeRequestDto } from "./dto/create-me-request.dto";
import { UpdateMeNominationDto } from "./dto/update-me-nomination.dto";
import { MeRightsService } from "./me-rights.service";

/** Principal-only façades for rights, notices, messages, and nominations.
 * A resource reference may appear in the path, but the represented principal
 * is always taken from `@CurrentPrincipal()`. */
@Public()
@UseGuards(JwtPrincipalGuard)
@Controller("me")
export class MeRightsController {
  constructor(private readonly service: MeRightsService) {}

  @Get("requests")
  listRequests(@CurrentPrincipal() principal: PrincipalActor) {
    return this.service.listRequests(principal.dataPrincipalId);
  }

  @Post("requests")
  createRequest(
    @CurrentPrincipal() principal: PrincipalActor,
    @Body() dto: CreateMeRequestDto,
  ) {
    return this.service.createRequest(principal.dataPrincipalId, dto);
  }

  @Get("requests/:reference")
  getRequest(
    @CurrentPrincipal() principal: PrincipalActor,
    @Param("reference") reference: string,
  ) {
    return this.service.getRequest(principal.dataPrincipalId, reference);
  }

  @Post("requests/:reference/cancel")
  cancelRequest(
    @CurrentPrincipal() principal: PrincipalActor,
    @Param("reference") reference: string,
  ) {
    return this.service.cancelRequest(principal.dataPrincipalId, reference);
  }

  @Post("requests/:reference/comment")
  commentOnRequest(
    @CurrentPrincipal() principal: PrincipalActor,
    @Param("reference") reference: string,
    @Body() dto: AddMeRequestCommentDto,
  ) {
    return this.service.commentOnRequest(
      principal.dataPrincipalId,
      reference,
      dto.comment,
    );
  }

  @Get("messages")
  listMessages(@CurrentPrincipal() principal: PrincipalActor) {
    return this.service.listMessages(principal.dataPrincipalId);
  }

  @Get("nomination")
  getNomination(@CurrentPrincipal() principal: PrincipalActor) {
    return this.service.getNomination(principal.dataPrincipalId);
  }

  @Put("nomination")
  upsertNomination(
    @CurrentPrincipal() principal: PrincipalActor,
    @Body() dto: UpdateMeNominationDto,
  ) {
    return this.service.upsertNomination(principal.dataPrincipalId, dto);
  }

  @Get("notices")
  listPublishedNotices() {
    return this.service.listPublishedNotices();
  }

  @Get("notices/:id")
  getPublishedNotice(
    @Param("id") id: string,
    @Query("lang") language?: string,
  ) {
    return this.service.getPublishedNotice(id, language ?? "en");
  }
}
