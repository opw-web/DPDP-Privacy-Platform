import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

/**
 * `POST /api/sdf/assessments/:id/complete`. Every field here is plain
 * optional -- there is deliberately NO `@ValidateIf`-conditional
 * cross-field validator (e.g. "isIndependent required IF kind is
 * AUDIT") on this DTO. That shape of validator runs inside Nest's
 * global `ValidationPipe`, BEFORE `SdfAssessmentService.complete` ever
 * runs, and would return a bare 400 for what is actually a Rule 13(1)
 * domain rejection with no citation attached -- the exact bug class the
 * task brief calls out (Task 6 shipped it once already). Every
 * completion requirement (SD-02 independence, SD-04 Board report) is
 * enforced in `SdfAssessmentService.complete` itself, against the
 * EFFECTIVE (existing row merged with this patch) state, where the
 * citation can be attached to the rejection.
 */
export class CompleteSdfAssessmentDto {
  @ApiPropertyOptional({
    description: "Independent data auditor / assessor name (SD-02, AUDIT only).",
  })
  @IsOptional()
  @IsString()
  conductedBy?: string;

  @ApiPropertyOptional({ description: "SD-02, AUDIT only." })
  @IsOptional()
  @IsBoolean()
  isIndependent?: boolean;

  @ApiPropertyOptional({ description: "Required to close any cycle row (SD-04)." })
  @IsOptional()
  @IsString()
  significantObservations?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportReference?: string;

  @ApiPropertyOptional({
    description: "ISO date-time the report was furnished to the Board. Required to close a cycle row (SD-04).",
  })
  @IsOptional()
  @IsDateString()
  furnishedToBoardAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  furnishedReference?: string;
}
