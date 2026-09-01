import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { AccessReportService } from "../evidence/access-report.service";
import { renderAccessReportPdf } from "../evidence/access-report-render";
import { RequestsService } from "./requests.service";
import { ListRequestsDto } from "./dto/list-requests.dto";
import { AssignRequestDto } from "./dto/assign-request.dto";
import { ChangeStatusDto } from "./dto/change-status.dto";
import { EscalateRequestDto } from "./dto/escalate-request.dto";
import { AddNoteDto } from "./dto/add-note.dto";
import { VerifyIdentityDto } from "./dto/verify-identity.dto";
import { FlagFrivolousDto } from "./dto/flag-frivolous.dto";

/**
 * Routes per spec lines 852-857, every one `CAN_MANAGE_REQUESTS`:
 *
 *   GET  /api/requests?status=&type=&assignee=&overdue=
 *   GET  /api/requests/stats
 *   GET  /api/requests/:ref
 *   POST /api/requests/:ref/assign
 *   POST /api/requests/:ref/status
 *   POST /api/requests/:ref/escalate
 *   POST /api/requests/:ref/note
 *   POST /api/requests/:ref/verify-identity
 *   POST /api/requests/:ref/flag-frivolous
 *
 * `GET /api/requests/:ref/access-report.pdf` serves Task 12's s.11 report
 * (RT-03/04), using the request's tenant-scoped principal ownership. There
 * is no `POST /api/requests`
 * creation route: the spec's endpoint table names none, and
 * `RequestsService.create()` is exported for the principal-portal task to
 * call instead (see that method's doc comment). `stats` is declared
 * BEFORE `:ref` so Nest's route matching does not swallow it as a
 * reference value.
 */
@ApiTags("requests")
@Controller("requests")
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly accessReportService: AccessReportService,
  ) {}

  @Get()
  @RequirePermission("CAN_MANAGE_REQUESTS")
  list(@Query() query: ListRequestsDto) {
    return this.requestsService.list(query);
  }

  @Get("stats")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  stats() {
    return this.requestsService.stats();
  }

  @Get(":ref")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  getByReference(@Param("ref") ref: string) {
    return this.requestsService.getByReference(ref);
  }

  @Get(":ref/access-report.pdf")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  async accessReport(
    @Param("ref") ref: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    // getByReference is tenant-scoped, so a reference from another
    // organisation is indistinguishable from a missing request. The report
    // service then applies the same tenant scope and non-disclosure filter.
    const request = await this.requestsService.getByReference(ref);
    const report = await this.accessReportService.buildReport(
      request.dataPrincipalId,
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${ref}-access-report.pdf"`,
    );
    return new StreamableFile(await renderAccessReportPdf(report));
  }

  @Post(":ref/assign")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  assign(@Param("ref") ref: string, @Body() dto: AssignRequestDto) {
    return this.requestsService.assign(ref, dto.employeeId, dto.note);
  }

  @Post(":ref/status")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  changeStatus(@Param("ref") ref: string, @Body() dto: ChangeStatusDto) {
    return this.requestsService.changeStatus(ref, dto);
  }

  @Post(":ref/escalate")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  escalate(@Param("ref") ref: string, @Body() dto: EscalateRequestDto) {
    return this.requestsService.escalate(ref, dto);
  }

  @Post(":ref/note")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  addNote(@Param("ref") ref: string, @Body() dto: AddNoteDto) {
    return this.requestsService.addNote(ref, dto);
  }

  @Post(":ref/verify-identity")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  verifyIdentity(@Param("ref") ref: string, @Body() dto: VerifyIdentityDto) {
    return this.requestsService.verifyIdentity(ref, dto);
  }

  @Post(":ref/flag-frivolous")
  @RequirePermission("CAN_MANAGE_REQUESTS")
  flagFrivolous(@Param("ref") ref: string, @Body() dto: FlagFrivolousDto) {
    return this.requestsService.flagFrivolous(ref, dto);
  }
}
