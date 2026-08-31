import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { SdfAssessmentService } from "./sdf-assessment.service";
import { AlgorithmRegisterService } from "./algorithm-register.service";
import { SdfGapsService } from "./sdf-gaps.service";
import { CreateSdfAssessmentDto } from "./dto/create-sdf-assessment.dto";
import { CompleteSdfAssessmentDto } from "./dto/complete-sdf-assessment.dto";
import { CreateAlgorithmEntryDto } from "./dto/create-algorithm-entry.dto";
import { UpdateAlgorithmEntryDto } from "./dto/update-algorithm-entry.dto";

/**
 * Routes per spec lines 883-885, verbatim:
 *   GET|POST /api/sdf/assessments             CAN_MANAGE_SDF
 *   POST /api/sdf/assessments/:id/complete    CAN_MANAGE_SDF
 *   GET|POST|PATCH /api/sdf/algorithms         CAN_MANAGE_SDF
 *   GET /api/sdf/gaps                          CAN_MANAGE_SDF
 *
 * `GET /assessments` is reachable regardless of
 * `Organization.isSignificantDataFiduciary` (spec §4.11: "visible
 * always") -- see `SdfAssessmentService.listWithReadiness`'s doc
 * comment. Only the write routes require the org to actually be a
 * declared SDF.
 */
@ApiTags("sdf")
@Controller("sdf")
export class SdfController {
  constructor(
    private readonly assessmentService: SdfAssessmentService,
    private readonly algorithmService: AlgorithmRegisterService,
    private readonly gapsService: SdfGapsService,
  ) {}

  @Get("assessments")
  @RequirePermission("CAN_MANAGE_SDF")
  listAssessments() {
    return this.assessmentService.listWithReadiness();
  }

  @Post("assessments")
  @RequirePermission("CAN_MANAGE_SDF")
  createAssessment(@Body() dto: CreateSdfAssessmentDto) {
    return this.assessmentService.create(dto);
  }

  @Post("assessments/:id/complete")
  @RequirePermission("CAN_MANAGE_SDF")
  completeAssessment(@Param("id") id: string, @Body() dto: CompleteSdfAssessmentDto) {
    return this.assessmentService.complete(id, dto);
  }

  @Get("algorithms")
  @RequirePermission("CAN_MANAGE_SDF")
  listAlgorithms() {
    return this.algorithmService.list();
  }

  @Post("algorithms")
  @RequirePermission("CAN_MANAGE_SDF")
  createAlgorithm(@Body() dto: CreateAlgorithmEntryDto) {
    return this.algorithmService.create(dto);
  }

  @Patch("algorithms/:id")
  @RequirePermission("CAN_MANAGE_SDF")
  updateAlgorithm(@Param("id") id: string, @Body() dto: UpdateAlgorithmEntryDto) {
    return this.algorithmService.update(id, dto);
  }

  @Get("gaps")
  @RequirePermission("CAN_MANAGE_SDF")
  getGaps() {
    return this.gapsService.getGaps();
  }
}
